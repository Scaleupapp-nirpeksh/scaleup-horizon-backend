// scripts/backfillTaskKeys.js
// Assigns human-readable task keys (e.g. SLT-1) to existing tasks that
// predate the taskKey feature. Keys are issued per organization in
// createdAt order so older tasks get lower numbers.
//
// Usage:
//   HORIZON_MONGODB_URI=... node scripts/backfillTaskKeys.js          (dry run)
//   HORIZON_MONGODB_URI=... APPLY=true node scripts/backfillTaskKeys.js
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const TaskCounter = require('../models/taskCounterModel');
const Organization = require('../models/organizationModel');

const APPLY = process.env.APPLY === 'true';

async function main() {
    const uri = process.env.HORIZON_MONGODB_URI;
    if (!uri) throw new Error('HORIZON_MONGODB_URI is not set');
    await mongoose.connect(uri);
    console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

    const orgIds = await Task.distinct('organization', { taskKey: { $exists: false } });
    const orgIdsNull = await Task.distinct('organization', { taskKey: null });
    const allOrgIds = [...new Set([...orgIds, ...orgIdsNull].map(String))];
    console.log(`Organizations with un-keyed tasks: ${allOrgIds.length}`);

    for (const orgId of allOrgIds) {
        const org = await Organization.findById(orgId).select('name');
        const orgName = org ? org.name : '(unknown org)';

        // Existing counter (tasks created after deploy may already have keys)
        let counter = await TaskCounter.findOne({ organization: orgId });
        const prefix = (counter && counter.prefix) || TaskCounter.derivePrefix(orgName);
        let seq = counter ? counter.seq : 0;

        const tasks = await Task.find({
            organization: orgId,
            $or: [{ taskKey: { $exists: false } }, { taskKey: null }]
        }).select('_id title createdAt').sort({ createdAt: 1 });

        console.log(`\n${orgName} (${orgId}) — prefix ${prefix}, starting at ${seq + 1}, ${tasks.length} tasks to key`);

        for (const t of tasks) {
            seq += 1;
            const key = `${prefix}-${seq}`;
            console.log(`  ${key}  <-  "${String(t.title).slice(0, 60)}"`);
            if (APPLY) {
                // updateOne bypasses the pre-save hook (we manage seq here)
                await Task.updateOne({ _id: t._id }, { $set: { taskKey: key } });
            }
        }

        if (APPLY) {
            await TaskCounter.findOneAndUpdate(
                { organization: orgId },
                { $set: { prefix, seq } },
                { upsert: true }
            );
            console.log(`  Counter for ${orgName} set to ${prefix}/${seq}`);
        }
    }

    await mongoose.connection.close();
    console.log(`\n${APPLY ? 'Backfill applied.' : 'Dry run complete — re-run with APPLY=true to write.'}`);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
