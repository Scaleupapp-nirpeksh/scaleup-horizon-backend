// routes/publicDataRoomRoutes.js
// Public visitor flow for investor data rooms — token-gated, NO auth.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const dataRoomController = require('../controllers/dataRoomController');

// Visitors are anonymous; keep abuse in check
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
});
router.use(publicLimiter);

router.get('/:token', dataRoomController.publicGetRoom);
router.post('/:token/enter', dataRoomController.publicEnterRoom);
router.post('/:token/documents/:docId/download', dataRoomController.publicDownloadDoc);
router.post('/:token/links/:linkId/visit', dataRoomController.publicVisitLink);

module.exports = router;
