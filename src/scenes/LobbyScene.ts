import Phaser from 'phaser';
import { SPACETIME_DB, SPACETIME_URI } from '../config';
import { lobbyOf, type LobbyState } from '../net/lobby';
import { currentSession, type Session } from '../net/session';
import { openOnlineBattle } from '../net/serverBattle';
import { PALETTE } from '../render/draw';
import { SCREEN } from '../game/view';
import { addButton, messageOf, textStyle, toast } from '../ui/widgets';

/** Where the HTML join-code input sits, in game pixels. It is placed over the canvas on every frame. */
const JOIN_BOX = { x: 330, y: 318, w: 190, h: 44 };
const CODE_LENGTH = 6;

/**
 * The lobby holds no state of its own. Everything on screen is derived from the subscribed rows,
 * so a reload lands in the right place: a waiting room, or the running battle.
 */
export class LobbyScene extends Phaser.Scene {
  private session: Session | null = null;
  private root: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;
  private joinInput: HTMLInputElement | null = null;
  private joinVisible = false;
  private busy = false;
  private leaving = false;
  private alive = false;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(): void {
    this.busy = false;
    this.leaving = false;
  }

  create(): void {
    this.alive = true;
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.text(480, 80, 'RUSTFRONT', textStyle(56, '#e8d9b5')).setOrigin(0.5);
    this.add.text(480, 130, 'Online 1v1 card RTS · test build', textStyle(14, '#8a7f6e')).setOrigin(0.5);
    this.add.text(16, 516, `SERVER ${SPACETIME_URI} · ${SPACETIME_DB}`, textStyle(11, '#6b6255'));
    this.root = this.add.container(0, 0);

    this.joinInput = document.getElementById('join-code') as HTMLInputElement | null;
    this.joinInput?.addEventListener('keydown', this.onJoinKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);

    this.session = currentSession();
    if (!this.session) {
      this.root.add(this.text(480, 270, 'Not connected. Reload the page.', 16, '#ff9c8a'));
      return;
    }
    this.unsubscribe = this.session.onChange(() => this.render());
    this.render();
  }

  override update(): void {
    if (this.joinVisible) this.placeJoinInput();
  }

  private readonly onShutdown = (): void => {
    this.alive = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.joinInput?.removeEventListener('keydown', this.onJoinKey);
    if (this.joinInput) this.joinInput.hidden = true;
    this.joinVisible = false;
  };

  private readonly onJoinKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') this.join();
  };

  private render(): void {
    if (!this.alive || this.leaving || !this.session || !this.root) return;
    const session = this.session;
    const state = lobbyOf(session);

    if (state.mine && state.activeBattleId !== null) {
      this.enterBattle(state.mine.team, state.activeBattleId);
      return;
    }

    const root = this.root;
    root.removeAll(true);
    root.add(this.text(480, 170, `Playing as ${state.displayName}`, 14, '#8a7f6e'));
    if (!session.isConnected()) {
      root.add(this.text(480, 196, 'Connection lost. Reload the page to reconnect.', 14, '#ff9c8a'));
    }

    if (!state.mine || !state.room) {
      root.add(addButton(this, 480, 250, 'CREATE ROOM', () => this.createRoom(), !this.busy));
      root.add(this.text(480, 300, 'or join a friend with a room code', 14, '#8a7f6e'));
      root.add(addButton(this, 610, 340, 'JOIN', () => this.join(), !this.busy));
      root.add(this.text(480, 420, 'Open a second tab to play yourself. Each tab is its own player.', 13, '#8a7f6e'));
      this.setJoinVisible(true);
      return;
    }

    this.setJoinVisible(false);
    root.add(this.text(480, 214, 'ROOM CODE', 14, '#8a7f6e'));
    root.add(this.text(480, 250, state.room.code, 44, '#e8d9b5'));
    this.renderSeats(state);

    if (state.room.status === 'finished') {
      root.add(this.text(480, 390, 'That battle has finished.', 16, '#e8d9b5'));
      root.add(addButton(this, 480, 430, 'LEAVE ROOM', () => this.leaveRoom(), !this.busy));
      return;
    }
    if (state.room.status === 'playing') {
      root.add(this.text(480, 390, 'Starting the battle...', 16, '#e8d9b5'));
      return;
    }

    const full = state.seats.length === 2;
    root.add(
      this.text(
        480,
        390,
        full ? 'Both players are in. Ready up to start.' : 'Waiting for an opponent. Share the code.',
        14,
        '#8a7f6e',
      ),
    );
    root.add(addButton(this, 400, 440, state.mine.ready ? 'CANCEL READY' : 'READY', () => this.toggleReady(state), !this.busy));
    root.add(addButton(this, 580, 440, 'LEAVE ROOM', () => this.leaveRoom(), !this.busy));
  }

  private renderSeats(state: LobbyState): void {
    const root = this.root;
    if (!root) return;
    (['red', 'blue'] as const).forEach((team, i) => {
      const seat = state.seats.find((s) => s.team === team);
      const label = team.toUpperCase().padEnd(5);
      const line = seat
        ? `${label} ${seat.name}${seat.mine ? ' (you)' : ''}   ${seat.ready ? 'READY' : 'not ready'}`
        : `${label} waiting for an opponent`;
      const color = team === 'red' ? '#e88a7e' : '#7fb3e8';
      root.add(this.text(480, 326 + i * 28, line, 16, seat ? color : '#6b6255'));
    });
  }

  private createRoom(): void {
    const session = this.session;
    if (!session) return;
    void this.run(() => session.conn.reducers.createRoom({}));
  }

  private join(): void {
    const session = this.session;
    if (!session || !this.joinInput) return;
    const code = this.joinInput.value.trim().toUpperCase();
    if (code.length !== CODE_LENGTH) {
      toast(this, `Room codes have ${CODE_LENGTH} characters.`, 'error');
      return;
    }
    this.joinInput.value = '';
    void this.run(() => session.conn.reducers.joinRoom({ code }));
  }

  private toggleReady(state: LobbyState): void {
    const session = this.session;
    if (!session || !state.mine) return;
    const ready = !state.mine.ready;
    void this.run(() => session.conn.reducers.setReady({ ready }));
  }

  private leaveRoom(): void {
    const session = this.session;
    if (!session) return;
    void this.run(() => session.conn.reducers.leaveRoom({}));
  }

  /** Runs one reducer call. Buttons stay disabled until it settles. The result shows up through the subscriptions. */
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await action();
    } catch (err) {
      if (this.alive) toast(this, messageOf(err), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private enterBattle(team: 'red' | 'blue', battleId: bigint): void {
    const session = this.session;
    if (!session) return;
    this.leaving = true;
    this.scene.start('BattleScene', { source: openOnlineBattle(session, battleId, team) });
  }

  private setJoinVisible(visible: boolean): void {
    this.joinVisible = visible;
    if (!this.joinInput) return;
    this.joinInput.hidden = !visible;
    if (visible) this.placeJoinInput();
  }

  /** Maps the game-space box to the canvas on screen, so the input follows the FIT scaling. */
  private placeJoinInput(): void {
    const el = this.joinInput;
    if (!el) return;
    const rect = this.game.canvas.getBoundingClientRect();
    const s = rect.width / SCREEN.width;
    el.style.left = `${rect.left + JOIN_BOX.x * s}px`;
    el.style.top = `${rect.top + JOIN_BOX.y * s}px`;
    el.style.width = `${JOIN_BOX.w * s}px`;
    el.style.height = `${JOIN_BOX.h * s}px`;
    el.style.fontSize = `${22 * s}px`;
  }

  private text(x: number, y: number, value: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, textStyle(size, color)).setOrigin(0.5);
  }
}
