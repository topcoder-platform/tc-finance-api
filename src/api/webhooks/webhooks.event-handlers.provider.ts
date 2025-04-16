import { Reflector } from '@nestjs/core';
import { WEBHOOK_EVENT_METADATA_KEY } from './webhooks.decorators';

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
const whEventHandlersFactory = (reflector: Reflector, handlerClasses) => {
  const handlersMap = new Map<
    string,
    (eventPayload: any) => Promise<unknown>
  >();

  for (const handlerClass of handlerClasses) {
    const prototype = Object.getPrototypeOf(handlerClass);
    for (const propertyName of Object.getOwnPropertyNames(prototype)) {
      const method = prototype[propertyName];
      if (typeof method !== 'function' || propertyName === 'constructor') {
        continue;
      }

      const eventTypes = reflector.get<string[]>(
        WEBHOOK_EVENT_METADATA_KEY,
        method,
      );

      if (eventTypes?.length > 0) {
        eventTypes.forEach((eventType) => {
          handlersMap.set(eventType, method.bind(handlerClass));
        });
      }
    }
  }

  return handlersMap;
};

/**
 * Creates a provider object for webhook event handlers.
 *
 * @param provide - The token that will be used to provide the dependency.
 * @param handlersKey - The key used to identify the specific handlers to inject.
 * @returns An object defining the provider with a factory function and its dependencies.
 */
export const getWebhooksEventHandlersProvider = (
  provide: string,
  handlersKey: string,
) => ({
  provide,
  useFactory: whEventHandlersFactory,
  inject: [Reflector, handlersKey],
});
