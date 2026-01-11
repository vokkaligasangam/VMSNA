// Run this in the browser console on your old site (vokkaligasangam.web.app)
// Make sure you're logged in as an admin

const exportFirestore = async () => {
    const collections = ['members', 'help_requests', 'contact_messages', 'education_help', 'medical_help', 'employment_help', 'other_services_help'];
    const exportData = {};

    for (const collectionName of collections) {
        console.log(`Exporting ${collectionName}...`);
        try {
            const snapshot = await firebase.firestore().collection(collectionName).get();
            exportData[collectionName] = [];
            snapshot.forEach(doc => {
                exportData[collectionName].push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`✓ Exported ${exportData[collectionName].length} documents from ${collectionName}`);
        } catch (error) {
            console.error(`Error exporting ${collectionName}:`, error);
        }
    }

    // Download as JSON file
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'firestore-export.json';
    link.click();

    console.log('✓ Export complete! Check your downloads.');
};

exportFirestore();
