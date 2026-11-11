const path = require('path');
const token = require('./env').required('DISCORD_TOKEN');
const { version } = require('./package');
const { ShardingManager } = require('discord.js');
const manager = new ShardingManager(path.join(__dirname, '/index.js'), { token });
const logShutdown = (cause, details = '') => {
    const message = details ? `Shutdown cause: ${cause}. ${details}` : `Shutdown cause: ${cause}.`;
    console.info(message);
};
console.info(new Date().toString());

//this is the top-level manager process (separate from each shard's own child process spawned
//below) - a safety net here too so a bug in this file's own event handlers can't silently kill
//the process that's responsible for respawning shards
process.on('SIGINT', () => {
    logShutdown('normal shutdown', 'received SIGINT');
    process.exit(0);
});
process.on('SIGTERM', () => {
    logShutdown('normal shutdown', 'received SIGTERM');
    process.exit(0);
});
process.on('beforeExit', () => {
    logShutdown('normal shutdown', 'event loop drained; process is exiting cleanly');
});
process.on('exit', (code) => {
    if (code === 0) {
        logShutdown('normal shutdown', `process exited with code ${code}`);
    } else {
        logShutdown('shutdown caused by crash or exception', `process exited with code ${code}`);
    }
});
process.on('unhandledRejection', (error) => {
    logShutdown('shutdown caused by crash or exception', `unhandledRejection: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Unhandled promise rejection in ShardingManager:', error);
    process.exitCode = 1;
});
process.on('uncaughtException', (error) => {
    logShutdown('shutdown caused by crash or exception', `uncaughtException: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Uncaught exception in ShardingManager:', error);
    process.exitCode = 1;
});

manager.spawn().catch(console.error);

manager.on('shardCreate', (shard) => {

    shard.on('death', (process) => {
        console.error('Shard ' + shard.id + ' closed unexpectedly! PID: ' + process.pid + '; Exit code: ' + process.exitCode + '.');

        if (process.exitCode === null) {
            console.warn(
                'WARNING: Shard ' + shard.id + ' exited with NULL error code. This may be a result of a lack of available system memory. Ensure that there is enough memory allocated to continue.');
        }
    });

    shard.on('disconnect', (event) => {
        console.warn('Shard ' + shard.id + ' disconnected. Dumping socket close event...');
        console.log(event);
    });

    //logged mainly so a slow reconnect (Discord backoff, session invalidation, network issues)
    //is visible as a gateway-level reconnect rather than looking identical to a full process
    //death+respawn in the logs
    shard.on('reconnecting', () => {
        console.warn('Shard ' + shard.id + ' is reconnecting to the gateway...');
    });

    shard.on('ready', async () => {
        const name = await shard.fetchClientValue('user.username');
        console.info(`${name}. Shard ${shard.id}/${manager.totalShards - 1}. Version ${version}`);
    });
});
