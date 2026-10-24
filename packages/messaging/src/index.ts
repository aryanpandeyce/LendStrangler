export * from './broker.interface.js';
export * from './in-memory.broker.js';
export * from './rabbitmq.broker.js';

import { IMessageBroker } from './broker.interface.js';
import { InMemoryBroker } from './in-memory.broker.js';
import { RabbitMQBroker } from './rabbitmq.broker.js';

let defaultBrokerInstance: IMessageBroker | null = null;

export function getMessageBroker(forceInMemory = false): IMessageBroker {
  if (defaultBrokerInstance) {
    return defaultBrokerInstance;
  }

  const useInMemory =
    forceInMemory ||
    process.env.USE_IN_MEMORY_BROKER === 'true' ||
    typeof window !== 'undefined' ||
    process.env.NODE_ENV === 'test';

  if (useInMemory) {
    defaultBrokerInstance = new InMemoryBroker();
  } else {
    try {
      defaultBrokerInstance = new RabbitMQBroker();
    } catch {
      console.warn('Falling back to InMemoryBroker due to RabbitMQ initialization error');
      defaultBrokerInstance = new InMemoryBroker();
    }
  }

  return defaultBrokerInstance;
}
