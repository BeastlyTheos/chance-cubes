const path = require('path');

// Secrets come from .env (compose's env_file, or this file when run by hand), never a checked-in config file.
try {
    process.loadEnvFile(path.join(__dirname, '.env'));
} catch(err) {
    // The variables may come from the environment instead; `required` names any that are missing.
    if(err.code !== 'ENOENT' && err.code !== 'EISDIR') throw err;
}

const optional = (name, fallback = '') => {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
};

const optionalInt = (name, fallback) => {
    const parsed = Number.parseInt(optional(name, String(fallback)), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

// Returns the variable's value, or stops the start naming it (never its value).
const required = (name) => {
    const value = process.env[name];
    if(!value) {
        console.error(`Missing ${ name }: set it in .env.`);
        process.exit(1);
    }
    return value;
};

const env = {
    adminID: optional('DISCORD_ADMIN_ID', ''),
    prefix: optional('BOT_PREFIX', optional('prefix', '!')),
    maxRollsPerDie: optionalInt('MAX_ROLLS_PER_DIE', 1000),
    databaseURL: optional('FIREBASE_DATABASE_URL', ''),
    swrpg: optional('EMOJI_GUILD_SWRPG', ''),
    genesys: optional('EMOJI_GUILD_GENESYS', ''),
    l5r: optional('EMOJI_GUILD_L5R', ''),
    buttonEmoji: optional('EMOJI_GUILD_BUTTON', ''),
    applicationId: optional('applicationId', ''),
    publicKey: optional('publicKey', ''),
    discordToken: optional('DISCORD_TOKEN', ''),
};

module.exports = { required, optional, optionalInt, ...env };
