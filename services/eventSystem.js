const EventEmitter = require('events');
const crypto = require('crypto');
const { ValidationError } = require('../utils/errors');

class EventSystem extends EventEmitter {
    constructor(logger = null) {
        super();
        this.logger = logger;
        
        // Define allowed event types
        this.EventTypes = {
            PRODUCT_VIEWED: 'PRODUCT_VIEWED',
            SEARCH_EXECUTED: 'SEARCH_EXECUTED',
            FILTER_APPLIED: 'FILTER_APPLIED',
            PRODUCT_CLICKED: 'PRODUCT_CLICKED',
            DEAL_DETECTED: 'DEAL_DETECTED',
            PRICE_CHANGED: 'PRICE_CHANGED',
            COMPARE_STARTED: 'COMPARE_STARTED'
        };

        // Standard event listener error boundary wrapper
        this.on('error', (err) => {
            if (this.logger) {
                this.logger.error('Unhandled exception in EventSystem subscriber:', err);
            } else {
                console.error('Unhandled exception in EventSystem subscriber:', err);
            }
        });
    }

    /**
     * Dispatch an event with schema validation
     * @param {string} eventType 
     * @param {object} actor - { ipHash, userAgent }
     * @param {object} payload 
     */
    dispatch(eventType, actor = {}, payload = {}) {
        if (!this.EventTypes[eventType]) {
            throw new ValidationError(`Invalid eventType dispatched: ${eventType}`);
        }

        const event = {
            eventId: crypto.randomUUID(),
            eventType,
            timestamp: new Date().toISOString(),
            actor: {
                ipHash: actor.ipHash || 'unknown',
                userAgent: actor.userAgent || 'unknown'
            },
            payload
        };

        // Schema validation rules per event
        this.validateEventSchema(event);

        if (this.logger) {
            this.logger.info(`Event dispatched: ${eventType}`, { eventId: event.eventId });
        }

        // Asynchronous emission
        process.nextTick(() => {
            try {
                this.emit(eventType, event);
                this.emit('*', event); // Global catch-all listener support
            } catch (err) {
                this.emit('error', err);
            }
        });

        return event;
    }

    /**
     * Validate event structure based on types
     */
    validateEventSchema(event) {
        const { eventType, payload } = event;

        switch (eventType) {
            case this.EventTypes.PRODUCT_VIEWED:
            case this.EventTypes.PRODUCT_CLICKED:
                if (!payload.familyId) {
                    throw new ValidationError(`${eventType} requires familyId in payload`);
                }
                break;

            case this.EventTypes.SEARCH_EXECUTED:
                if (!payload.query) {
                    throw new ValidationError(`${eventType} requires query string in payload`);
                }
                break;

            case this.EventTypes.FILTER_APPLIED:
                if (!payload.filters) {
                    throw new ValidationError(`${eventType} requires filters object in payload`);
                }
                break;

            case this.EventTypes.PRICE_CHANGED:
                if (!payload.variantId || payload.oldPrice === undefined || payload.newPrice === undefined) {
                    throw new ValidationError(`${eventType} requires variantId, oldPrice, and newPrice in payload`);
                }
                break;

            case this.EventTypes.DEAL_DETECTED:
                if (!payload.variantId || !payload.discountPct) {
                    throw new ValidationError(`${eventType} requires variantId and discountPct in payload`);
                }
                break;

            case this.EventTypes.COMPARE_STARTED:
                if (!payload.productIds || !Array.isArray(payload.productIds)) {
                    throw new ValidationError(`${eventType} requires productIds array in payload`);
                }
                break;
        }
    }
}

module.exports = EventSystem;
