/** Connection settings. Override at build or dev time with VITE_SPACETIME_URI and VITE_SPACETIME_DB. */
export const SPACETIME_URI: string = import.meta.env.VITE_SPACETIME_URI || 'ws://127.0.0.1:3000';
export const SPACETIME_DB: string = import.meta.env.VITE_SPACETIME_DB || 'rustfront-ci';
