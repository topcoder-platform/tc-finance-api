import { Provider } from '@nestjs/common';
import { PaymentHandler } from './payment.handler';
import { TrolleyWebhookEvent } from '../webhooks.types';
import { Reflector } from '@nestjs/core';
import { WEBHOOK_EVENT_METADATA_KEY } from './decorators';

/**
 * Factory function to create a map of Trolley webhook event handlers.
 *
 * This function iterates over the provided handler classes and inspects their methods
 * to find those annotated with specific metadata indicating the Trolley webhook events
 * they handle. It then binds these methods to their respective event types and stores
 * them in a map for easy lookup.
 *
 * @param reflector - An instance of `Reflector` used to retrieve metadata from methods.
 * @param handlerClasses - An array of handler class instances containing methods
 *                         annotated with Trolley webhook event metadata.
 * @returns A `Map` where the keys are `TrolleyWebhookEvent` types and the values are
 *          bound handler functions for those events.
 */
const trolleyHandlerFnsFactory = (reflector: Reflector, handlerClasses) => {
  const handlersMap = new Map<TrolleyWebhookEvent, () => void>();

  for (const handlerClass of handlerClasses) {
    const prototype = Object.getPrototypeOf(handlerClass);
    for (const propertyName of Object.getOwnPropertyNames(prototype)) {
      const method = prototype[propertyName];
      if (typeof method !== 'function' || propertyName === 'constructor') {
        continue;
      }

      const eventTypes = reflector.get<TrolleyWebhookEvent[]>(
        WEBHOOK_EVENT_METADATA_KEY,
        method,
      );

      if (eventTypes?.length > 0) {
        eventTypes.forEach((eventType) => {
          handlersMap.set(eventType, method.bind(handlerClass));
          console.log(`Found event handler: ${eventType} -> ${propertyName}`);
        });
      }
    }
  }

  return handlersMap;
};

export const TrolleyWebhookHandlersProviders: Provider[] = [
  PaymentHandler,
  {
    provide: 'TrolleyWebhookHandlers',
    useFactory: (paymentHandler: PaymentHandler) => [paymentHandler],
    inject: [PaymentHandler],
  },
  {
    provide: 'trolleyHandlerFns',
    useFactory: trolleyHandlerFnsFactory,
    inject: [Reflector, 'TrolleyWebhookHandlers'],
  },
];
