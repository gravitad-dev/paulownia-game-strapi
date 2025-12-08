export default {
    async afterUpdate(event) {
        const { result, params } = event;
        const { data } = params;

        // Check if there are codes to process
        if (data.codesInput && data.codesInput.trim().length > 0) {
            const rawCodes = data.codesInput.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);
            
            if (rawCodes.length === 0) return;

            let added = 0;
            let duplicates = 0;
            let errors = 0;

            for (const code of rawCodes) {
                try {
                    // Check if exists
                    const existing = await strapi.documents('api::premium-code.premium-code').findFirst({
                        filters: { code: code }
                    });

                    if (existing) {
                        duplicates++;
                        continue;
                    }

                    // Create new code
                    await strapi.documents('api::premium-code.premium-code').create({
                        data: {
                            code: code,
                            isUsed: false
                        }
                    });
                    added++;
                } catch (e) {
                    console.error('Error importing code:', code, e);
                    errors++;
                }
            }

            // Update the config entity to show report and clear input
            // We use strapi.db.query to avoid infinite loop of update hooks if we used entityService.update without care
            // Or we can just update the current result if it's beforeUpdate, but here we are in afterUpdate.
            // A safer way in afterUpdate is to update directly but ensure we don't trigger logic again if input is empty.
            
            // Wait, if I update here, I trigger afterUpdate again? 
            // Yes, unless I pass context. But simpler: clear the input field in the update.
            
            try {
                 await strapi.db.query('api::premium-code-config.premium-code-config').update({
                    where: { id: result.id },
                    data: {
                        codesInput: '', // Clear input
                        lastImportReport: {
                            timestamp: new Date(),
                            totalProcessed: rawCodes.length,
                            added: added,
                            duplicates: duplicates,
                            errors: errors,
                            status: 'Success'
                        }
                    }
                });
            } catch (err) {
                console.error('Error updating report:', err);
            }
        }
    }
};
