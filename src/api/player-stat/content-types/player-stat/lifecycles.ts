import { errors } from '@strapi/utils';
const { ApplicationError } = errors;

export default {
  async beforeCreate(event) {
    validateCurrencyValues(event.params.data);
  },
  
  async beforeUpdate(event) {
    validateCurrencyValues(event.params.data);
  },
};

function validateCurrencyValues(data: any) {
  const currencyFields = [
    'coins',
    'tickets',
    'coinsEarned',
    'coinsSpent',
    'ticketsEarned',
    'ticketsSpent',
  ];

  for (const field of currencyFields) {
    if (data[field] !== undefined && data[field] < 0) {
      throw new ApplicationError(`${field} cannot be negative. Received: ${data[field]}`);
    }
  }
}
