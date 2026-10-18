const COLOR_PREFIXES = ['yellow', 'green', 'blue', 'red', 'purple', 'black', 'white'];
const FACE_WORDS = {
    s: 'success',
    t: 'threat',
    f: 'failure',
    r: 'triumph',
    a: 'advantage',
    d: 'despair'
};
const FORCE_NAME_MAP = {
    whitegif: 'force_',
    white: 'force_blank_',
    whitel: 'force_light_',
    whitell: 'force_double_light_',
    whiten: 'force_dark_',
    whitenn: 'force_double_dark_'
};

const renameColorEmojiKey = (key) => {
    if (typeof key !== 'string') return key;
    if (key.includes('_')) return key;
    if (FORCE_NAME_MAP[key]) return FORCE_NAME_MAP[key];

    const color = COLOR_PREFIXES.find(prefix => key.startsWith(prefix));
    if (!color) return key;

    const suffix = key.slice(color.length);
    if (!suffix) return `${color}_blank_`;
    if (suffix === 'gif') return `${color}_gif_`;
    if (suffix === 'diamond') return `${color}_diamond_`;
    if (!/^[saftrdln]+$/.test(suffix)) return key;

    const tokens = [];
    for (let i = 0; i < suffix.length; i++) {
        const letter = suffix[i];
        const next = suffix[i + 1];
        const word = FACE_WORDS[letter];

        if (word && next === letter) {
            tokens.push(`double_${word}`);
            i++;
            continue;
        }

        if (word) {
            tokens.push(word);
            continue;
        }

        tokens.push(letter);
    }

    return `${color}_${tokens.join('_')}_`;
};

const normalizeEmojiKey = (key) => {
    const renamed = renameColorEmojiKey(key);
    if (typeof renamed !== 'string' || !renamed.length) return renamed;
    const colorBlank = renamed.replace(/^(yellow|green|blue|red|purple|black|white)_$/i, '$1_blank_');
    const withDoubleSeparator = colorBlank.replace(/double(?=[A-Za-z])/g, 'double_');
    const compacted = withDoubleSeparator.replace(/_{2,}/g, '_');
    return compacted.endsWith('_') ? compacted : `${compacted}_`;
};

module.exports = {
    renameColorEmojiKey,
    normalizeEmojiKey
};
