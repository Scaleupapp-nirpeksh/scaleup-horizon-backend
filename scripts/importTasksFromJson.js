// scripts/importTasksFromJson.js
// Imports an epic/task tree from a JSON plan file. Used for migrating
// externally tracked work (e.g. Excel) into ScaleUp Horizon.
//
// Plan file shape:
// {
//   "organizationId": "...",
//   "creatorEmail": "user@example.com",         // becomes creator + default assignee
//   "extraWatcherEmails": ["other@example.com"],
//   "root": {                                    // optional master epic
//     "title": "...", "taskType": "epic", "description": "...", ...
//     "children": [ { ...task, "children": [...] }, ... ]
//   }
// }
// Each node supports: title, taskType, description, category, subcategory,
// tags[], priority, status, dueDate, startDate, assigneeEmail, children[].
//
// Usage:
//   HORIZON_MONGODB_URI=... node scripts/importTasksFromJson.js plan.json           (dry run)
//   HORIZON_MONGODB_URI=... APPLY=true node scripts/importTasksFromJson.js plan.json
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const TaskComment = require('../models/taskCommentModel');
require('../models/taskCounterModel');
require('../models/organizationModel');
const HorizonUser = require('../models/userModel');
const Membership = require('../models/membershipModel');

const APPLY = process.env.APPLY === 'true';

async function resolveUser(email, orgId) {
    if (!email) return null;
    const user = await HorizonUser.findOne({ email: String(email).toLowerCase() });
    if (!user) throw new Error(`No user found for email ${email}`);
    const membership = await Membership.findOne({ user: user._id, organization: orgId, status: 'active' });
    if (!membership) throw new Error(`${email} is not an active member of org ${orgId}`);
    return user;
}

let created = 0;

async function createNode(node, parentId, ctx, depth) {
    const indent = '  '.repeat(depth);
    const assignee = node.assigneeEmail
        ? await resolveUser(node.assigneeEmail, ctx.orgId)
        : ctx.defaultAssignee;

    console.log(`${indent}${node.taskType === 'epic' ? 'EPIC' : 'task'}: "${node.title}"`
        + (node.dueDate ? ` due ${node.dueDate}` : '')
        + (node.status ? ` [${node.status}]` : '')
        + ` -> ${assignee ? assignee.email : 'unassigned'}`);

    let taskId = null;
    if (APPLY) {
        const task = new Task({
            organization: ctx.orgId,
            creator: ctx.creator._id,
            taskType: node.taskType === 'epic' ? 'epic' : 'task',
            title: node.title,
            description: node.description || '',
            category: node.category || 'other',
            subcategory: node.subcategory || null,
            tags: node.tags || [],
            priority: node.priority || 'medium',
            status: node.status || 'todo',
            assignee: assignee ? assignee._id : null,
            dueDate: node.dueDate ? new Date(node.dueDate) : null,
            startDate: node.startDate ? new Date(node.startDate) : null,
            parentTask: parentId,
            watchers: ctx.watcherIds,
        });
        await task.save(); // pre-save hook assigns the task key
        taskId = task._id;
        console.log(`${indent}  -> created ${task.taskKey}`);

        if (parentId) {
            await Task.updateOne({ _id: parentId }, { $addToSet: { subtasks: taskId } });
        }
        await TaskComment.createSystemComment(
            taskId, ctx.orgId, 'status', null, task.status, ctx.creator._id
        );
    }
    created += 1;

    for (const child of node.children || []) {
        await createNode(child, taskId, ctx, depth + 1);
    }
}

async function main() {
    const planPath = process.argv[2];
    if (!planPath) throw new Error('Usage: node scripts/importTasksFromJson.js <plan.json>');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    const uri = process.env.HORIZON_MONGODB_URI;
    if (!uri) throw new Error('HORIZON_MONGODB_URI is not set');
    await mongoose.connect(uri);
    console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    const orgId = new mongoose.Types.ObjectId(plan.organizationId);
    const creator = await resolveUser(plan.creatorEmail, orgId);
    const watcherIds = [creator._id];
    for (const email of plan.extraWatcherEmails || []) {
        const watcher = await resolveUser(email, orgId);
        watcherIds.push(watcher._id);
    }

    const ctx = { orgId, creator, defaultAssignee: creator, watcherIds };
    await createNode(plan.root, null, ctx, 0);

    await mongoose.connection.close();
    console.log(`\n${created} tasks ${APPLY ? 'created' : 'would be created'}.`
        + (APPLY ? '' : ' Re-run with APPLY=true to write.'));
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
