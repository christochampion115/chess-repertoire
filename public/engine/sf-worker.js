/**
 * sf-worker.js — Wrapper Worker for Stockfish 18
 *
 * Why this file exists:
 * Stockfish (Emscripten) computes the WASM URL from self.location.href.
 * When loaded as a blob Worker, self.location.href is "blob:http://..." and
 * the URL construction breaks → malformed fetch → TypeError.
 *
 * This file is loaded as a *real* URL so self.location.href is always correct.
 * The main thread sends the WASM ArrayBuffer via postMessage before any UCI
 * command. We set self.Module = { wasmBinary: buffer } which Stockfish reads
 * at startup (l.wasmBinary && (a = l.wasmBinary)) and uses directly, bypassing
 * its internal fetch() for the WASM file entirely.
 */

self.addEventListener('message', function init(e) {
  if (e.data && e.data.__sf_wasm) {
    self.removeEventListener('message', init);

    // Module.wasmBinary tells Emscripten/Stockfish to use this buffer directly.
    // It must be set BEFORE importScripts() runs the Stockfish IIFE.
    self.Module = { wasmBinary: e.data.__sf_wasm };

    // importScripts is synchronous and resolves relative to THIS file's URL,
    // so it correctly resolves to engine/stockfish-18-lite-single.js.
    importScripts('./stockfish-18-lite-single.js');
  }
});
