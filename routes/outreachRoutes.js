// routes/outreachRoutes.js
const express = require('express');
const router = express.Router();
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole,
} = require('../middleware/authMiddleware');
const outreachController = require('../controllers/outreachController');

router.use(protect);
router.use(requireActiveOrganization);
const member = authorizeOrganizationRole(['owner', 'member']);

router.get('/profile', member, outreachController.getProfile);
router.put('/profile', member, outreachController.updateProfile);

router.post('/targets', member, outreachController.createTarget);
router.get('/targets', member, outreachController.getTargets);
router.put('/targets/:id', member, outreachController.updateTarget);
router.delete('/targets/:id', member, outreachController.deleteTarget);

router.post('/targets/:id/research', member, outreachController.researchTarget);
router.post('/targets/:id/draft', member, outreachController.draftEmail);
router.post('/targets/:id/mark-sent', member, outreachController.markSent);

module.exports = router;
