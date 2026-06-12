// routes/dataRoomRoutes.js
// Founder-side data room management (authenticated).
const express = require('express');
const router = express.Router();
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole,
} = require('../middleware/authMiddleware');
const dataRoomController = require('../controllers/dataRoomController');

router.use(protect);
router.use(requireActiveOrganization);
const member = authorizeOrganizationRole(['owner', 'member']);

router.post('/', member, dataRoomController.createDataRoom);
router.get('/', member, dataRoomController.getDataRooms);
router.get('/:id', member, dataRoomController.getDataRoomById);
router.put('/:id', member, dataRoomController.updateDataRoom);
router.post('/:id/regenerate-link', member, dataRoomController.regenerateLink);
router.delete('/:id', member, dataRoomController.deleteDataRoom);

module.exports = router;
