const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { required, databaseURL } = require('./env');

const appConfig = {
    credential: cert({
        projectId: required('FIREBASE_PROJECT_ID'),
        clientEmail: required('FIREBASE_CLIENT_EMAIL'),
        // .env keeps the key's newlines as the two characters \n
        privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
    })
};
if (databaseURL) appConfig.databaseURL = databaseURL;
initializeApp(appConfig);

const db = getFirestore();

exports.db = db;
