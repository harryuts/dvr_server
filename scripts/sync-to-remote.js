import { exec } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const REMOTE_HOST = process.env.REMOTE_HOST || '192.168.1.225';
const REMOTE_USER = process.env.REMOTE_USER || 'harry';
const REMOTE_PATH = process.env.REMOTE_PATH || '/home/harry/Scripts/dvr_server';

const excludes = [
    'node_modules/',
    'client/node_modules/',
    'client/dist/',
    'capture/',
    'video_output/',
    'evidence/',
    '*.db',
    '*.log',
    '.git/',
    '.env',
    'certs/',
    'test_media/',
    'config.json'
];

const excludeArgs = excludes.map(e => `--exclude='${e}'`).join(' ');

const rsyncCommand = `rsync -avz --progress ${excludeArgs} ./ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/`;

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║  Syncing DVR Server to Remote                       ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log(`  Host: ${REMOTE_HOST}`);
console.log(`  User: ${REMOTE_USER}`);
console.log(`  Path: ${REMOTE_PATH}`);
console.log('═══════════════════════════════════════════════════════');
console.log('  Running rsync...\n');

exec(rsyncCommand, (error, stdout, stderr) => {
    if (error) {
        console.error(`\n✗ Error: ${error.message}`);
        console.error('\n═══════════════════════════════════════════════════════');
        console.error('  Make sure:');
        console.error('  1. SSH access is configured');
        console.error('  2. Remote directory exists');
        console.error('  3. rsync is installed on both systems');
        console.error('═══════════════════════════════════════════════════════\n');
        process.exit(1);
    }

    if (stderr && !stderr.includes('rsync:')) {
        console.error(`stderr: ${stderr}`);
    }

    console.log(stdout);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✓ Sync completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n  Next steps on the server:');
    console.log(`  1. SSH into server: ssh ${REMOTE_USER}@${REMOTE_HOST}`);
    console.log(`  2. Navigate to: cd ${REMOTE_PATH}`);
    console.log('  3. Install dependencies: npm install && npm run build');
    console.log('  4. Start: npm start'); // Or pm2 start
    console.log('═══════════════════════════════════════════════════════\n');
});
