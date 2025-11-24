import { generateUuid } from '../helpers/uuidGenerator';

export const autoUuid = {
  async beforeCreate(event: any) {
    const { model, params } = event;
    
    // Check if the model has a 'uuid' attribute
    if (model.attributes && model.attributes.uuid) {
      // If uuid is not already provided, generate one
      if (!params.data.uuid) {
        params.data.uuid = generateUuid();
      }
    }
  },
};
