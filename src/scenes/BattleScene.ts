import Phaser from 'phaser';
import { SPACETIME_DB } from '../config';
import { matchPhase } from '../../shared/rules/economy';
import type { TeamId } from '../../shared/types';
import { currentSession } from '../net/session';
import type { BattleSnapshot, BattleSource, ViewCard } from '../game/source';
import {
  affordable,
  ARENA_FRAME,
  arenaRect,
  CARD_SIZE,
  cardInfo,
  countsFor,
  endReasonLabel,
  formatClock,
  handRects,
  handView,
  headquartersOf,
  hpFraction,
  incomeLabel,
  inRect,
  isVisibleTo,
  lerp,
  outcomeFor,
  pendingProgress,
  phaseLabel,
  placementHint,
  providersOf,
  tickAlpha,
  timeLeftMs,
  toArena,
  type CardInfo,
  type Point,
} from '../game/view';
import {
  drawBar,
  drawCard,
  drawEmptySlot,
  drawField,
  drawGhost,
  drawMine,
  drawPending,
  drawStructure,
  drawTerritory,
  drawUnit,
  PALETTE,
  teamColor,
} from '../render/draw';
import { addButton, messageOf, textStyle, toast } from '../ui/widgets';

export interface BattleSceneData {
  source: BattleSource;
  /** Demo only. Starts a fresh offline match for the "new match" button. */
  restart?: () => BattleSource;
}

const DEFAULT_HELP =
  'Drag a card onto the field to play it. Drop it on STORE to keep it. Or tap a card to select it, then tap the field.';
const DRAG_THRESHOLD_PX = 6;
const HAND_SLOTS = 4; // Three hand slots and the store slot.

export class BattleScene extends Phaser.Scene {
  private source!: BattleSource;
  private restartDemo: (() => BattleSource) | undefined;
  private alive = false;
  private snap: BattleSnapshot | null = null;
  /** Entity positions at the previous tick. The screen moves each unit from here to its current position. */
  private prevPos = new Map<number, Point>();
  private arrivedAt = 0;
  private selected: string | null = null;
  private drag: { id: string; startX: number; startY: number; moved: boolean } | null = null;
  private pointer: Point = { x: 0, y: 0 };
  private readonly inFlight = new Set<string>();
  private ended = false;
  private endObjects: Phaser.GameObjects.GameObject[] = [];

  private territoryGfx!: Phaser.GameObjects.Graphics;
  private entityGfx!: Phaser.GameObjects.Graphics;
  private handGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private said = new Map<string, string>();

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: BattleSceneData): void {
    this.source = data.source;
    this.restartDemo = data.restart;
    this.alive = false;
    this.snap = null;
    this.prevPos = new Map();
    this.arrivedAt = 0;
    this.selected = null;
    this.drag = null;
    this.inFlight.clear();
    this.ended = false;
    this.endObjects = [];
    this.labels = new Map();
    this.said = new Map();
  }

  create(): void {
    this.alive = true;
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    drawField(this.add.graphics(), ARENA_FRAME);
    this.territoryGfx = this.add.graphics();
    this.entityGfx = this.add.graphics();
    this.handGfx = this.add.graphics();
    this.hudGfx = this.add.graphics();
    this.ghostGfx = this.add.graphics();
    this.buildLabels();
    this.say('mode', this.source.mode === 'demo' ? 'DEMO · offline, blue is a bot' : `ONLINE · ${SPACETIME_DB}`);

    this.input.on('pointerdown', this.onDown);
    this.input.on('pointermove', this.onMove);
    this.input.on('pointerup', this.onUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
  }

  override update(time: number): void {
    if (!this.alive) return;
    const s = this.source.snapshot();
    if (!s) {
      this.say('status', 'Loading battle...');
      return;
    }
    this.say('status', '');
    if (s !== this.snap) this.acceptSnapshot(s, time);
    this.drawEntities(time);
    this.drawHand();
    this.drawHud(s);
    this.drawGhost(s);
    if (s.ended && !this.ended) this.showEnd(s);
  }

  private readonly onShutdown = (): void => {
    this.alive = false;
    this.input.off('pointerdown', this.onDown);
    this.input.off('pointermove', this.onMove);
    this.input.off('pointerup', this.onUp);
    this.source.dispose();
  };

  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    if (!this.alive || this.ended || !this.snap) return;
    this.pointer = { x: p.x, y: p.y };
    const hit = this.cardAt(p.x, p.y);
    if (hit) {
      this.drag = { id: hit, startX: p.x, startY: p.y, moved: false };
      return;
    }
    // Tap-to-play: a selected card goes to the tapped spot on the field.
    if (this.selected && inRect(arenaRect(), p.x, p.y)) {
      const card = this.cardById(this.selected);
      if (card) this.tryPlay(card, toArena(p.x, p.y));
      else this.selected = null;
    }
  };

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    this.pointer = { x: p.x, y: p.y };
    const drag = this.drag;
    if (drag && !drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
  };

  private readonly onUp = (p: Phaser.Input.Pointer): void => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !this.alive || this.ended) return;
    this.pointer = { x: p.x, y: p.y };
    if (!drag.moved) {
      // A tap toggles the selection.
      this.selected = this.selected === drag.id ? null : drag.id;
      return;
    }
    const card = this.cardById(drag.id);
    if (!card) return;
    if (inRect(handRects().stored, p.x, p.y)) {
      if (card.zone === 'hand') this.tryStore(card);
      return;
    }
    if (inRect(arenaRect(), p.x, p.y)) this.tryPlay(card, toArena(p.x, p.y));
  };

  /** Keeps the previous tick's positions so units glide between ticks. Other changes keep the same timing. */
  private acceptSnapshot(s: BattleSnapshot, now: number): void {
    if (!this.snap || s.elapsedMs !== this.snap.elapsedMs) {
      if (this.snap) this.prevPos = new Map(this.snap.entities.map((e): [number, Point] => [e.id, { x: e.x, y: e.y }]));
      this.arrivedAt = now;
    }
    this.snap = s;
    this.territoryGfx.clear();
    for (const team of ['red', 'blue'] as const) {
      drawTerritory(this.territoryGfx, ARENA_FRAME, providersOf(s.entities, team), team);
    }
  }

  private drawEntities(now: number): void {
    const s = this.snap;
    if (!s) return;
    const me = this.source.myTeam;
    const g = this.entityGfx;
    g.clear();
    for (const p of s.pending) drawPending(g, ARENA_FRAME, p, pendingProgress(p, s.elapsedMs));
    const t = tickAlpha(now, this.arrivedAt);
    for (const e of s.entities) {
      if (!isVisibleTo(e, me, s.elapsedMs)) continue;
      // Own concealed pieces are drawn faint so the player still sees them.
      const dim = e.team === me && e.concealedUntilMs > s.elapsedMs ? 0.5 : 1;
      if (e.kind === 'structure') {
        drawStructure(g, ARENA_FRAME, e, dim);
      } else if (e.kind === 'unit') {
        const from = this.prevPos.get(e.id) ?? { x: e.x, y: e.y };
        drawUnit(g, ARENA_FRAME, e, { x: lerp(from.x, e.x, t), y: lerp(from.y, e.y, t) }, dim);
      } else if (e.kind === 'mine') {
        drawMine(g, ARENA_FRAME, { x: e.x, y: e.y }, dim);
      }
    }
  }

  private drawHand(): void {
    const s = this.snap;
    if (!s) return;
    const g = this.handGfx;
    g.clear();
    const rects = handRects();
    const view = handView(s.cards);

    for (let i = 0; i < HAND_SLOTS; i++) {
      const rect = i < 3 ? rects.hand[i]! : rects.stored;
      const card = i < 3 ? view.slots[i] : view.stored;
      if (!card) {
        drawEmptySlot(g, rect);
        this.setCardLabels(i, null);
        continue;
      }
      const info = cardInfo(card.cardId);
      drawCard(g, rect, info.category, {
        selected: this.selected === card.instanceId,
        affordable: affordable(info.cost, s.myPoints),
        sending: this.inFlight.has(card.instanceId),
      });
      this.setCardLabels(i, card, info);
    }

    if (this.drag?.moved && inRect(rects.stored, this.pointer.x, this.pointer.y)) {
      g.lineStyle(3, PALETTE.warn, 1);
      g.strokeRoundedRect(rects.stored.x, rects.stored.y, rects.stored.w, rects.stored.h, 8);
    }
    this.labels.get('store')?.setVisible(view.stored === null);
  }

  private drawHud(s: BattleSnapshot): void {
    const me = this.source.myTeam;
    const enemy: TeamId = me === 'red' ? 'blue' : 'red';
    const g = this.hudGfx;
    g.clear();

    this.say('mine', `YOU · ${me.toUpperCase()}   PTS ${Math.floor(s.myPoints)}`);
    this.say('enemy', `ENEMY · ${enemy.toUpperCase()}`);
    this.say('clock', formatClock(timeLeftMs(s.elapsedMs)));
    this.say('phase', `${phaseLabel(matchPhase(s.elapsedMs))} · ${incomeLabel(s.elapsedMs)}`);

    const counts = countsFor(s.entities, me, s.elapsedMs);
    const waveIn = Math.ceil(Math.max(0, s.nextWaveAtMs - s.elapsedMs) / 1000);
    this.say('left', `FORCES\nunits ${counts.myUnits}\nstructures ${counts.myStructures}\n\nnext wave ${waveIn}s`);
    this.say('right', `ENEMY (VISIBLE)\nunits ${counts.enemyUnits}\nstructures ${counts.enemyStructures}`);

    const myHq = headquartersOf(s.entities, me);
    const enemyHq = headquartersOf(s.entities, enemy);
    drawBar(g, { x: 20, y: 28, w: 150, h: 8 }, hpFraction(myHq?.hp ?? 0, myHq?.maxHp ?? 1), teamColor(me));
    drawBar(g, { x: 790, y: 28, w: 150, h: 8 }, hpFraction(enemyHq?.hp ?? 0, enemyHq?.maxHp ?? 1), teamColor(enemy));
  }

  /** Shows what a drag or selection would do, and why it would fail, before the request is sent. */
  private drawGhost(s: BattleSnapshot): void {
    const g = this.ghostGfx;
    g.clear();
    if (this.ended) return;
    const me = this.source.myTeam;
    const dragging = this.drag?.moved ? this.drag.id : null;
    const card = (dragging ?? this.selected) ? this.cardById((dragging ?? this.selected)!) : null;
    if (!card) {
      this.say('help', DEFAULT_HELP);
      return;
    }
    const info = cardInfo(card.cardId);
    const over = inRect(arenaRect(), this.pointer.x, this.pointer.y);

    if (over) {
      const at = toArena(this.pointer.x, this.pointer.y);
      const hint = placementHint(info.category, card.cardId, at, s.entities, me);
      drawGhost(g, ARENA_FRAME, card.cardId, info.category, at, hint);
      this.say('help', hint.ok ? `${info.name}: ${info.description}` : `Cannot play here: ${hint.reason}`);
      return;
    }
    if (dragging) {
      drawCard(
        g,
        { x: this.pointer.x - CARD_SIZE.w / 2, y: this.pointer.y - CARD_SIZE.h / 2, w: CARD_SIZE.w, h: CARD_SIZE.h },
        info.category,
        { selected: true, affordable: true, sending: false },
      );
      const overStore = inRect(handRects().stored, this.pointer.x, this.pointer.y);
      this.say(
        'help',
        overStore
          ? 'Release to store this card. It replaces the stored card.'
          : `${info.name}: release on the field to play it, or on STORE to keep it.`,
      );
      return;
    }
    this.say('help', `${info.name}: ${info.description} Tap the field to play.`);
  }

  private showEnd(s: BattleSnapshot): void {
    this.ended = true;
    this.selected = null;
    this.drag = null;
    const outcome = outcomeFor(s.winner, this.source.myTeam);
    const title = outcome === 'victory' ? 'VICTORY' : outcome === 'defeat' ? 'DEFEAT' : 'DRAW';
    const color = outcome === 'victory' ? '#9fe0a0' : outcome === 'defeat' ? '#ff9c8a' : '#e8d9b5';

    const shade = this.add.rectangle(480, 270, 960, 540, 0x000000, 0.6).setDepth(200);
    const panel = this.add.rectangle(480, 270, 480, 230, PALETTE.panel).setStrokeStyle(2, PALETTE.border).setDepth(201);
    const heading = this.add.text(480, 196, title, textStyle(44, color)).setOrigin(0.5).setDepth(202);
    const reason = this.add
      .text(480, 248, endReasonLabel(s.endReason), textStyle(14, '#e8d9b5', { align: 'center', wordWrap: { width: 420 } }))
      .setOrigin(0.5, 0)
      .setDepth(202);
    this.endObjects.push(shade, panel, heading, reason);

    if (this.restartDemo) {
      this.endObjects.push(addButton(this, 480, 360, 'NEW DEMO MATCH', () => this.newDemoMatch()));
    } else {
      this.endObjects.push(addButton(this, 480, 360, 'BACK TO LOBBY', () => void this.backToLobby()));
    }
  }

  private newDemoMatch(): void {
    if (!this.restartDemo) return;
    this.scene.restart({ source: this.restartDemo(), restart: this.restartDemo });
  }

  private async backToLobby(): Promise<void> {
    const session = currentSession();
    if (!session) {
      toast(this, 'Not connected. Reload the page.', 'error');
      return;
    }
    try {
      await session.conn.reducers.leaveRoom({});
    } catch (err) {
      if (this.alive) toast(this, messageOf(err), 'error');
      return;
    }
    if (this.alive) this.scene.start('LobbyScene');
  }

  private tryPlay(card: ViewCard, at: Point): void {
    const s = this.snap;
    if (!s || this.inFlight.has(card.instanceId)) return;
    const info = cardInfo(card.cardId);
    if (!affordable(info.cost, s.myPoints)) {
      toast(this, `Not enough points. ${info.name} costs ${info.cost}.`, 'error');
      return;
    }
    const hint = placementHint(info.category, card.cardId, at, s.entities, this.source.myTeam);
    if (!hint.ok) {
      toast(this, hint.reason ?? 'Cannot play there.', 'error');
      return;
    }
    this.selected = null;
    this.send(card.instanceId, this.source.play(card.instanceId, at.x, at.y));
  }

  private tryStore(card: ViewCard): void {
    if (this.inFlight.has(card.instanceId)) return;
    this.selected = null;
    this.send(card.instanceId, this.source.store(card.instanceId));
  }

  /** The card stays on screen, marked as sending, until the server answers. It is never removed locally. */
  private send(instanceId: string, request: Promise<void>): void {
    this.inFlight.add(instanceId);
    request
      .catch((err: unknown) => {
        if (this.alive) toast(this, messageOf(err), 'error');
      })
      .finally(() => {
        this.inFlight.delete(instanceId);
      });
  }

  private cardAt(x: number, y: number): string | null {
    const s = this.snap;
    if (!s) return null;
    const rects = handRects();
    const view = handView(s.cards);
    for (let i = 0; i < 3; i++) {
      if (inRect(rects.hand[i]!, x, y)) return view.slots[i]?.instanceId ?? null;
    }
    if (inRect(rects.stored, x, y)) return view.stored?.instanceId ?? null;
    return null;
  }

  private cardById(instanceId: string): ViewCard | null {
    return this.snap?.cards.find((c) => c.instanceId === instanceId) ?? null;
  }

  private buildLabels(): void {
    this.addLabel('mine', 20, 8, 13, '#e88a7e');
    this.addLabel('enemy', 940, 8, 13, '#7fb3e8', 1, 0);
    this.addLabel('clock', 480, 4, 20, '#e8d9b5', 0.5, 0);
    this.addLabel('phase', 480, 27, 11, '#8a7f6e', 0.5, 0);
    this.addLabel('left', 16, 62, 12, '#8a7f6e');
    this.addLabel('right', 944, 62, 12, '#8a7f6e', 1, 0);
    this.addLabel('help', 770, 412, 11, '#e8d9b5', 0, 0, { wordWrap: { width: 170 } });
    this.addLabel('mode', 16, 200, 11, '#6b6255', 0, 0, { wordWrap: { width: 150 } });
    this.addLabel('status', 480, 250, 18, '#e8d9b5', 0.5, 0.5);
    const store = handRects().stored;
    this.addLabel('store', store.x + store.w / 2, store.y + store.h / 2, 13, '#8a7f6e', 0.5, 0.5);
    this.say('store', 'STORE');

    const rects = handRects();
    for (let i = 0; i < HAND_SLOTS; i++) {
      const r = i < 3 ? rects.hand[i]! : rects.stored;
      // Narrower than the card so long names wrap before they reach the cost.
      this.addLabel(`card${i}.name`, r.x + 10, r.y + 10, 12, '#e8d9b5', 0, 0, { wordWrap: { width: 104 } });
      this.addLabel(`card${i}.cost`, r.x + r.w - 10, r.y + 10, 14, '#e2b93b', 1, 0);
      this.addLabel(`card${i}.tag`, r.x + 20, r.y + r.h - 24, 10, '#8a7f6e');
    }
  }

  private addLabel(
    key: string,
    x: number,
    y: number,
    size: number,
    color: string,
    originX = 0,
    originY = 0,
    extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
  ): void {
    const text = this.add
      .text(x, y, '', textStyle(size, color, extra))
      .setOrigin(originX, originY)
      .setDepth(10);
    this.labels.set(key, text);
  }

  /** Writes text only when it changed, so frames do not reflow text that stays the same. */
  private say(key: string, value: string): void {
    if (this.said.get(key) === value) return;
    this.said.set(key, value);
    this.labels.get(key)?.setText(value);
  }

  private setCardLabels(slot: number, card: ViewCard | null, info?: CardInfo): void {
    const visible = card !== null && info !== undefined;
    for (const part of ['name', 'cost', 'tag']) {
      this.labels.get(`card${slot}.${part}`)?.setVisible(visible);
    }
    if (!card || !info) return;
    this.say(`card${slot}.name`, info.name);
    this.say(`card${slot}.cost`, String(info.cost));
    const category = info.category.toUpperCase();
    this.say(`card${slot}.tag`, card.zone === 'stored' ? `STORED · ${category}` : category);
  }
}
