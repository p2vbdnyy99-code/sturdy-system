// Serves files for LocalDiskStorage's signed URLs. Only relevant when
// BIDPILOT_STORAGE_DRIVER=local — with the 's3' driver, signed URLs point
// directly at the storage provider and never touch this route at all.
import express from 'express';
import { getStorage } from '../storage/index.js';
import { log } from '../../logger.js';

export function createDownloadRouter() {
  const router = express.Router();

  router.get('/files/:key', async (req, res) => {
    const storage = getStorage();
    if (typeof storage.verify !== 'function') {
      // The active backend isn't LocalDiskStorage (e.g. 's3') — this route
      // should never be reached in that configuration.
      return res.status(404).json({ error: 'Not found.' });
    }

    const { key } = req.params;
    const ok = storage.verify(key, req.query.expires, req.query.sig);
    if (!ok) {
      return res.status(403).json({ error: 'Invalid or expired link.' });
    }

    try {
      const buffer = await storage.readObject(key);
      res.type('application/pdf');
      return res.send(buffer);
    } catch (err) {
      log.error('bidpilot download route error:', err);
      return res.status(404).json({ error: 'Not found.' });
    }
  });

  return router;
}
