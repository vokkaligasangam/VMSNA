const admin = require('firebase-admin');
const fs = require('fs');

// Initialize old project
const oldServiceAccount = {
    projectId: 'vokkaligasangam'
};

const oldApp = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...oldServiceAccount
}, 'oldProject');

const oldDb = oldApp.firestore();

async function exportFirestore() {
    const collections = ['members', 'help_requests', 'contact_messages', 'education_help', 'medical_help', 'employment_help', 'other_services_help'];
    const exportData = {};

    for (const collectionName of collections) {
        console.log(`Exporting collection: ${collectionName}`);
        const snapshot = await oldDb.collection(collectionName).get();
        exportData[collectionName] = [];

        snapshot.forEach(doc => {
            exportData[collectionName].push({
                id: doc.id,
                data: doc.data()
            });
        });
        console.log(`  - Exported ${exportData[collectionName].length} documents`);
    }

    fs.writeFileSync('firestore-export.json', JSON.stringify(exportData, null, 2));
    console.log('\nExport complete! Saved to firestore-export.json');
    process.exit(0);
}

exportFirestore().catch(console.error);
