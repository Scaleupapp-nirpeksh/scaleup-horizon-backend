// controllers/dataRoomController.js
// Investor data rooms: founder-side management plus the public, tokenized
// visitor flow (room view + per-document presigned downloads, all logged).
const crypto = require('crypto');
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const DataRoom = require('../models/dataRoomModel');
const Document = require('../models/documentModel');
const Organization = require('../models/organizationModel');

const s3 = new AWS.S3({
    accessKeyId: process.env.HORIZON_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.HORIZON_AWS_SECRET_ACCESS_KEY,
    region: process.env.HORIZON_AWS_REGION || 'ap-south-1',
});
const BUCKET = process.env.HORIZON_S3_BUCKET_NAME || 'scaleup-horizon-documents';

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const newToken = () => crypto.randomBytes(24).toString('hex');
const MAX_LOG = 1000;

async function resolveOrgDocuments(orgId, documentIds) {
    const ids = (documentIds || []).filter(isId);
    if (!ids.length) return [];
    const docs = await Document.find({ _id: { $in: ids }, organization: orgId }).select('_id');
    const found = new Set(docs.map(d => String(d._id)));
    // Preserve the order the founder chose
    return ids.filter(id => found.has(String(id))).map(id => ({ document: id }));
}

// ----------------------------------------------------------- founder side

/**
 * @desc    Create a data room
 * @route   POST /api/horizon/data-rooms
 * @body    { name, description?, documentIds?, requireEmail?, expiresAt? }
 */
exports.createDataRoom = async (req, res) => {
    try {
        if (!req.body.name || !String(req.body.name).trim()) {
            return res.status(400).json({ msg: 'Data room name is required' });
        }
        const room = await DataRoom.create({
            organization: req.organization._id,
            createdBy: req.user._id,
            name: String(req.body.name).trim(),
            description: req.body.description,
            documents: await resolveOrgDocuments(req.organization._id, req.body.documentIds),
            shareToken: newToken(),
            requireEmail: req.body.requireEmail !== false,
            expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        });
        res.status(201).json({ msg: 'Data room created', dataRoom: room });
    } catch (err) {
        console.error('Error creating data room:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not create data room');
    }
};

/**
 * @desc    List data rooms (no access log payload)
 * @route   GET /api/horizon/data-rooms
 */
exports.getDataRooms = async (req, res) => {
    try {
        const rooms = await DataRoom.find({ organization: req.organization._id })
            .select('-accessLog')
            .populate('documents.document', 'fileName fileType fileSize category')
            .sort({ createdAt: -1 });
        res.json({ dataRooms: rooms });
    } catch (err) {
        console.error('Error listing data rooms:', err.message);
        res.status(500).send('Server Error: Could not list data rooms');
    }
};

/**
 * @desc    One data room with its access log (latest first, capped at 300)
 * @route   GET /api/horizon/data-rooms/:id
 */
exports.getDataRoomById = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid data room ID format' });
        const room = await DataRoom.findOne({ _id: req.params.id, organization: req.organization._id })
            .populate('documents.document', 'fileName fileType fileSize category');
        if (!room) return res.status(404).json({ msg: 'Data room not found in your organization' });
        const obj = room.toObject();
        obj.accessLog = (obj.accessLog || []).slice(-300).reverse();
        res.json({ dataRoom: obj });
    } catch (err) {
        console.error('Error fetching data room:', err.message);
        res.status(500).send('Server Error: Could not fetch data room');
    }
};

/**
 * @desc    Update a data room (name/desc/docs/gating/expiry/active)
 * @route   PUT /api/horizon/data-rooms/:id
 */
exports.updateDataRoom = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid data room ID format' });
        const room = await DataRoom.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!room) return res.status(404).json({ msg: 'Data room not found in your organization' });

        if (req.body.name !== undefined && String(req.body.name).trim()) room.name = String(req.body.name).trim();
        if (req.body.description !== undefined) room.description = req.body.description;
        if (req.body.documentIds !== undefined) {
            room.documents = await resolveOrgDocuments(req.organization._id, req.body.documentIds);
        }
        if (req.body.requireEmail !== undefined) room.requireEmail = !!req.body.requireEmail;
        if (req.body.isActive !== undefined) room.isActive = !!req.body.isActive;
        if (req.body.expiresAt !== undefined) {
            room.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
        }

        await room.save();
        res.json({ msg: 'Data room updated', dataRoom: room });
    } catch (err) {
        console.error('Error updating data room:', err.message);
        res.status(500).send('Server Error: Could not update data room');
    }
};

/**
 * @desc    Rotate the share link (old link stops working immediately)
 * @route   POST /api/horizon/data-rooms/:id/regenerate-link
 */
exports.regenerateLink = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid data room ID format' });
        const room = await DataRoom.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!room) return res.status(404).json({ msg: 'Data room not found in your organization' });
        room.shareToken = newToken();
        await room.save();
        res.json({ msg: 'Share link regenerated', shareToken: room.shareToken });
    } catch (err) {
        console.error('Error regenerating data room link:', err.message);
        res.status(500).send('Server Error: Could not regenerate link');
    }
};

/**
 * @desc    Delete a data room (documents themselves are untouched)
 * @route   DELETE /api/horizon/data-rooms/:id
 */
exports.deleteDataRoom = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid data room ID format' });
        const room = await DataRoom.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
        if (!room) return res.status(404).json({ msg: 'Data room not found in your organization' });
        res.json({ msg: 'Data room deleted' });
    } catch (err) {
        console.error('Error deleting data room:', err.message);
        res.status(500).send('Server Error: Could not delete data room');
    }
};

// ----------------------------------------------------------- public side

function publicDocList(room) {
    return (room.documents || [])
        .filter(d => d.document)
        .map(d => ({
            id: d.document._id,
            fileName: d.label || d.document.fileName,
            fileType: d.document.fileType,
            fileSize: d.document.fileSize,
            category: d.document.category,
        }));
}

function logAccess(room, entry) {
    room.accessLog.push(entry);
    if (room.accessLog.length > MAX_LOG) {
        room.accessLog = room.accessLog.slice(-MAX_LOG);
    }
    room.lastAccessedAt = new Date();
}

/**
 * @desc    Public room metadata (no documents until /enter)
 * @route   GET /api/horizon/public/data-rooms/:token
 * @access  Public
 */
exports.publicGetRoom = async (req, res) => {
    try {
        const room = await DataRoom.findOne({ shareToken: req.params.token }).select('-accessLog');
        if (!room || !room.isOpen()) return res.status(404).json({ msg: 'This data room is unavailable. Ask the founder for a fresh link.' });
        const org = await Organization.findById(room.organization).select('name');
        res.json({
            name: room.name,
            description: room.description || '',
            organizationName: org ? org.name : '',
            requireEmail: room.requireEmail,
            documentCount: (room.documents || []).length,
        });
    } catch (err) {
        console.error('Error fetching public data room:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * @desc    Enter the room: logs the visit, returns the document list
 * @route   POST /api/horizon/public/data-rooms/:token/enter
 * @body    { email? } — required when the room has requireEmail
 * @access  Public
 */
exports.publicEnterRoom = async (req, res) => {
    try {
        const room = await DataRoom.findOne({ shareToken: req.params.token })
            .populate('documents.document', 'fileName fileType fileSize category');
        if (!room || !room.isOpen()) return res.status(404).json({ msg: 'This data room is unavailable. Ask the founder for a fresh link.' });

        const email = String(req.body.email || '').trim().toLowerCase();
        if (room.requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ msg: 'A valid email is required to view this data room' });
        }

        logAccess(room, { action: 'view_room', email: email || undefined, ip: req.ip });
        room.viewCount += 1;
        await room.save();

        res.json({ name: room.name, description: room.description || '', documents: publicDocList(room) });
    } catch (err) {
        console.error('Error entering public data room:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * @desc    Presigned download for one document in the room (logged)
 * @route   POST /api/horizon/public/data-rooms/:token/documents/:docId/download
 * @body    { email? }
 * @access  Public
 */
exports.publicDownloadDoc = async (req, res) => {
    try {
        if (!isId(req.params.docId)) return res.status(400).json({ msg: 'Invalid document reference' });
        const room = await DataRoom.findOne({ shareToken: req.params.token });
        if (!room || !room.isOpen()) return res.status(404).json({ msg: 'This data room is unavailable.' });

        const inRoom = (room.documents || []).some(d => String(d.document) === req.params.docId);
        if (!inRoom) return res.status(404).json({ msg: 'Document is not part of this data room' });

        const email = String(req.body.email || '').trim().toLowerCase();
        if (room.requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ msg: 'A valid email is required to download from this data room' });
        }

        const doc = await Document.findOne({ _id: req.params.docId, organization: room.organization });
        if (!doc) return res.status(404).json({ msg: 'Document no longer exists' });

        const downloadUrl = await s3.getSignedUrlPromise('getObject', {
            Bucket: BUCKET,
            Key: doc.storageKey,
            Expires: 300,
        });

        logAccess(room, { action: 'download_doc', email: email || undefined, documentId: doc._id, fileName: doc.fileName, ip: req.ip });
        await room.save();

        res.json({ downloadUrl, fileName: doc.fileName });
    } catch (err) {
        console.error('Error issuing data room download:', err.message);
        res.status(500).send('Server Error');
    }
};
