let db = null;
let firebaseEnabled = false;
const hasFirebaseEnv =
  !!process.env.FIREBASE_PROJECT_ID &&
  !!process.env.FIREBASE_CLIENT_EMAIL &&
  !!process.env.FIREBASE_PRIVATE_KEY;
if (hasFirebaseEnv) {
  try {
    ({ db } = require("../firestore"));
    firebaseEnabled = true;
  } catch (error) {}
}
const { prefix } = require("../env");
const memoryStore = new Map();

const getDefaultData = (dataSet) => {
  if (dataSet === "channelEmoji") return "swrpg";
  //legacy per-guild prefix, kept only so we can detect and redirect users still on the old ! commands
  if (dataSet === "prefix") return prefix;
  return {};
};

const normalizeData = (dataSet, data) => {
  if (
    dataSet !== "characterStatus" ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return data;
  }
  Object.keys(data).forEach((name) => {
    if (!data[name].crit) data[name].crit = [];
    if (!data[name].obligation) data[name].obligation = {};
  });
  return data;
};

const getMemoryKey = (client, message, dataSet) => {
  const botName = client?.user?.username || "unknown_bot";
  const guildId = message?.guild?.id || "dm";
  const channelId =
    dataSet === "prefix"
      ? "guild_scope"
      : message?.channel?.id || "unknown_channel";
  const userId =
    dataSet === "diceResult" ? message?.author?.id || "unknown_user" : "";
  return `${botName}|${guildId}|${channelId}|${userId}|${dataSet}`;
};

const readData = async (client, message, dataSet) => {
  if (!firebaseEnabled) {
    const key = getMemoryKey(client, message, dataSet);
    const stored = memoryStore.get(key);
    if (stored === undefined) return getDefaultData(dataSet);
    return normalizeData(dataSet, stored);
  }

  let dbRef = getDbRef(client, message, dataSet);
  let doc = await dbRef.get();
  if (!doc.exists) {
    return getDefaultData(dataSet);
  } else {
    let data = doc.data()[dataSet];
    if (!data) data = {};
    return normalizeData(dataSet, data);
  }
};

const writeData = (client, message, dataSet, data, merge = false) => {
  if (!firebaseEnabled) {
    const key = getMemoryKey(client, message, dataSet);
    if (
      merge &&
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      memoryStore.get(key) &&
      typeof memoryStore.get(key) === "object" &&
      !Array.isArray(memoryStore.get(key))
    ) {
      memoryStore.set(key, { ...memoryStore.get(key), ...data });
    } else {
      memoryStore.set(key, data);
    }
    return;
  }

  //required lazily to avoid a load-order-dependent circular require with ../index
  //(see modules/functions.js for the full explanation)
  const main = require("../index");
  let dbRef = getDbRef(client, message, dataSet);
  return dbRef
    .set({ [dataSet]: data }, { merge })
    .catch((error) => main.logError("writeData", error));
};

const getDbRef = (client, message, dataSet) => {
  let dbRef = db.collection("Bots").doc(`${client.user.username}_Discord`);

  if (message.guild) {
    dbRef = dbRef.collection("Guild").doc(message.guild.id);
  }

  //legacy per-guild prefix was stored above the Channel level - keep that path so old data is still reachable
  if (dataSet !== "prefix") {
    dbRef = dbRef.collection("Channel").doc(message.channel.id);
  }

  //per-user data within the channel - the last roll, and /character's in-progress obligation/duty/morality/inventory edit
  if (dataSet === "diceResult" || dataSet === "trackDraft") {
    dbRef = dbRef.collection("User").doc(message.author.id);
  }

  dbRef = dbRef.collection("Data").doc(dataSet);
  return dbRef;
};

exports.readData = readData;
exports.writeData = writeData;
