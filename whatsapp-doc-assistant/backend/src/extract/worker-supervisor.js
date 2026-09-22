// Shared child-process supervision for the isolated PDF workers.
// -----------------------------------------------------------------------------
// Both heavy pdf.js paths — digital span extraction and OCR — run in their own
// child process so the server survives whatever happens inside: a synchronous
// decode loop that never yields (uninterruptible from the same thread) or a
// memory blow-up (uncatchable if it shares the heap, because the kernel
// SIGKILLs the whole process). A child has its own heap and OS identity, so a
// `--max-old-space-size` breach kills the CHILD as a reportable error, a kernel
// OOM-kill targets the (largest) child not the parent, and SIGKILL from the
// parent interrupts a stuck loop outright. See ocr-runner.js for the full
// history that led here.
//
// This module is the mechanics only; each caller supplies its own worker
// script, its own error classes, and a `parse` that validates the child's
// success payload. Every failure mode resolves to a rejection the router turns
// into a friendly message — the parent must never die with the child.

import { fork } from 'node:child_process';
import { log } from '../logger.js';

/**
 * Fork and supervise a worker, guaranteeing the returned promise settles
 * exactly once and the child is always reaped.
 * @param {string} workerPath absolute path to the fork target
 * @param {*} payload structured-cloneable job for the child
 * @param {object} opts
 * @param {number} opts.timeoutMs hard wall-clock budget; on expiry the child is SIGKILLed
 * @param {number} opts.maxHeapMb V8 old-space cap for the child
 * @param {string} opts.label short name used only in the timeout log line
 * @param {(ms:number)=>Error} opts.timeoutError builds the rejection on timeout
 * @param {(msg:string)=>Error} opts.workerError builds the rejection on any failure
 * @param {(msg:any)=>any} opts.parse returns the resolved value from an ok-message;
 *        throw to mark the payload malformed
 */
export function superviseChild(workerPath, payload, opts) {
  const { timeoutMs, maxHeapMb, label, timeoutError, workerError, parse } = opts;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = fork(workerPath, [], {
        // 'advanced' keeps structured-clone semantics over IPC so Buffers/Maps
        // survive intact; default JSON would balloon the PDF into a number array.
        serialization: 'advanced',
        execArgv: [`--max-old-space-size=${maxHeapMb}`],
        // Inherit stdio so the child's logs and any V8 fatal error land in the
        // server's own stream.
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
    } catch (err) {
      reject(workerError(err?.message || String(err)));
      return;
    }

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Detach handlers so the kill below can't re-settle via 'exit'.
      child.removeAllListeners();
      // SIGKILL, not SIGTERM: a child stuck in a synchronous loop never reaches
      // its signal handlers, so only an uncatchable signal stops it.
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      fn(value);
    };

    const timer = setTimeout(() => {
      log.warn(`${label} exceeded ${timeoutMs}ms — killing the child process`);
      finish(reject, timeoutError(timeoutMs));
    }, timeoutMs);
    timer.unref?.();

    child.on('message', (msg) => {
      if (msg?.ok) {
        try {
          finish(resolve, parse(msg));
        } catch (err) {
          finish(reject, workerError(err?.message || 'worker returned a malformed result'));
        }
      } else {
        finish(reject, workerError(msg?.error || 'unknown worker error'));
      }
    });

    // Failed to spawn, or the IPC channel broke.
    child.on('error', (err) => finish(reject, workerError(err?.message || String(err))));

    // Exited without a result — heap limit hit, kernel OOM-kill, or a crash.
    // This is the path that used to take the whole server down silently.
    child.on('exit', (code, signal) =>
      finish(
        reject,
        workerError(`child process exited unexpectedly (code ${code}, signal ${signal || 'none'})`),
      ),
    );

    try {
      child.send(payload);
    } catch (err) {
      finish(reject, workerError(`could not send job to child: ${err?.message || err}`));
    }
  });
}
