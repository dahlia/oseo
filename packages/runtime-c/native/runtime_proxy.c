#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

/* Proxy exotic objects and their thirteen essential internal methods. */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

static OseoValue argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult revoked(OseoContext *context, OseoValue proxy) {
    if (!proxy_object(proxy)->revoked) {
        return normal(proxy);
    }
    return type_error(
        context, "Cannot perform an operation on a revoked Proxy.");
}

static OseoResult proxy_trap(
    OseoContext *context,
    OseoValue proxy,
    const char *name
) {
    OseoResult live = revoked(context, proxy);
    if (live.status != OSEO_STATUS_NORMAL) return live;
    OseoValue slots[2] = {proxy, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            proxy_object(slots[0])->handler,
            slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_nullish(result.value) && !is_callable(result.value)) {
        result = type_error(context, "A Proxy trap must be callable.");
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult proxy_complete(
    OseoContext *context,
    OseoRootFrame *frame,
    OseoResult result
) {
    oseo_roots_pop(context, frame);
    oseo_call_leave(context);
    return result;
}

static void initialize_ordinary(
    OseoContext *context,
    OseoOrdinaryObject *object
) {
    object->prototype = oseo_null();
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->private_elements = NULL;
    object->private_element_capacity = 0u;
    object->private_element_count = 0u;
    object->shape_id = context->next_shape_id++;
    object->array_length = 0u;
    object->dictionary = true;
    object->length_writable = false;
    object->extensible = true;
    object->module_namespace = false;
    object->immutable_prototype = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->virtual_string_iterator = false;
    object->virtual_string_iterator_configurable = false;
    object->virtual_string_iterator_enumerable = false;
    object->virtual_string_iterator_writable = false;
    object->iterator_kind = OSEO_ITERATOR_NONE;
    object->iterator_target = oseo_undefined();
    object->iterator_index = 0u;
    object->regexp_string_iterator = false;
    object->regexp_iterator_regexp = oseo_undefined();
    object->regexp_iterator_subject = oseo_undefined();
    object->regexp_iterator_global = false;
    object->regexp_iterator_unicode = false;
    object->regexp_iterator_complete = false;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->wrap_for_valid_iterator = false;
    object->wrapped_iterator = oseo_undefined();
    object->wrapped_next = oseo_undefined();
    object->arguments_object = false;
    object->mapped_arguments = false;
    object->generator = NULL;
}

static OseoResult proxy_create(
    OseoContext *context,
    OseoValue target,
    OseoValue handler
) {
    if (!is_object(target) || !is_object(handler)) {
        return type_error(context, "Proxy requires object target and handler.");
    }
    OseoProxy *proxy =
        oseo_internal_allocate_heap_bytes(context, sizeof(*proxy));
    if (proxy == NULL) {
        return failure(context, "OSEO2001", "Proxy allocation failed.");
    }
    initialize_ordinary(context, &proxy->ordinary);
    proxy->target = target;
    proxy->handler = handler;
    proxy->callable = is_callable(target);
    proxy->constructible = function_is_constructible(target);
    proxy->revoked = false;
    return oseo_internal_publish_heap(
        context, &proxy->ordinary.header, OSEO_HEAP_PROXY);
}

static OseoResult call_trap(
    OseoContext *context,
    OseoValue proxy,
    OseoValue trap,
    size_t argument_count,
    const OseoValue *arguments
) {
    return oseo_call_function(
        context,
        trap,
        proxy_object(proxy)->handler,
        argument_count,
        arguments,
        oseo_undefined()
    );
}

static OseoResult target_own_property(
    OseoContext *context,
    OseoValue target,
    OseoValue key,
    bool *found,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
) {
    if (is_proxy(target)) {
        return oseo_internal_proxy_get_own_property(
            context, target, key, found, value, attributes, getter, setter);
    }
    *found = oseo_internal_own_property_descriptor(
        context, target, key, value, attributes, getter, setter);
    return normal(oseo_undefined());
}

static OseoResult target_is_extensible(
    OseoContext *context,
    OseoValue target
) {
    return oseo_internal_is_extensible(context, target);
}

OseoResult oseo_internal_proxy_get(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key,
    OseoValue receiver
) {
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[5] = {
        proxy, key, receiver, oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "get");
    slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[3])) {
        result = oseo_super_get(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            slots[2]
        );
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[3] = {
        proxy_object(slots[0])->target, slots[1], slots[2],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[3], 3u, trap_arguments);
        slots[4] = result.value;
    }
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    bool found = false;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &found,
            &target_value,
            &attributes,
            &getter,
            &setter
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && found &&
        !attributes.configurable) {
        if (!attributes.accessor && !attributes.writable &&
            !oseo_internal_same_value(slots[4], target_value)) {
            result = type_error(
                context, "Proxy get trap violated an invariant.");
        } else if (attributes.accessor &&
                   tag_of(getter) == OSEO_TAG_UNDEFINED &&
                   tag_of(slots[4]) != OSEO_TAG_UNDEFINED) {
            result = type_error(
                context, "Proxy get trap violated an invariant.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[4];
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_proxy_set(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key,
    OseoValue value,
    OseoValue receiver,
    const char **refusal
) {
    *refusal = NULL;
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[5] = {
        proxy, key, value, receiver, oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "set");
    slots[4] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[4])) {
        result = oseo_internal_set_with_receiver(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            slots[2],
            slots[3],
            refusal
        );
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[4] = {
        proxy_object(slots[0])->target, slots[1], slots[2], slots[3],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[4], 4u, trap_arguments);
    }
    bool accepted = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    bool found = false;
    if (accepted) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &found,
            &target_value,
            &attributes,
            &getter,
            &setter
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && accepted && found &&
        !attributes.configurable) {
        if (!attributes.accessor && !attributes.writable &&
            !oseo_internal_same_value(slots[2], target_value)) {
            result = type_error(
                context, "Proxy set trap violated an invariant.");
        } else if (attributes.accessor &&
                   tag_of(setter) == OSEO_TAG_UNDEFINED) {
            result = type_error(
                context, "Proxy set trap violated an invariant.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !accepted) {
        *refusal = "Proxy set trap returned false.";
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[2];
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_proxy_has(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key
) {
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[3] = {proxy, key, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "has");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_has_property(
            context, slots[1], proxy_object(slots[0])->target);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[2] = {
        proxy_object(slots[0])->target, slots[1],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[2], 2u, trap_arguments);
    }
    bool present = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    bool found = false;
    if (result.status == OSEO_STATUS_NORMAL && !present) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &found,
            &target_value,
            &attributes,
            &getter,
            &setter
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && found) {
        if (!attributes.configurable) {
            result = type_error(
                context, "Proxy has trap violated an invariant.");
        } else {
            OseoResult extensible = target_is_extensible(
                context, proxy_object(slots[0])->target);
            if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
            else if (!oseo_to_boolean(extensible.value)) {
                result = type_error(
                    context, "Proxy has trap violated an invariant.");
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_boolean(present));
    }
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_get_prototype(
    OseoContext *context,
    OseoValue object_value
) {
    if (!is_proxy(object_value)) {
        return normal(ordinary_object(object_value)->prototype);
    }
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[3] = {object_value, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "getPrototypeOf");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_internal_get_prototype(
            context, proxy_object(slots[0])->target);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[1] = {proxy_object(slots[0])->target};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[1], 1u, trap_arguments);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[2]) != OSEO_TAG_NULL && !is_object(slots[2])) {
        result = type_error(
            context, "Proxy getPrototypeOf trap returned a non-object.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoResult extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
        else if (!oseo_to_boolean(extensible.value)) {
            OseoResult actual = oseo_internal_get_prototype(
                context, proxy_object(slots[0])->target);
            if (actual.status != OSEO_STATUS_NORMAL) result = actual;
            else if (!oseo_internal_same_value(actual.value, slots[2])) {
                result = type_error(
                    context,
                    "Proxy getPrototypeOf trap violated an invariant.");
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[2];
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_proxy_set_prototype(
    OseoContext *context,
    OseoValue proxy,
    OseoValue prototype,
    const char **refusal
) {
    *refusal = NULL;
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[3] = {proxy, prototype, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "setPrototypeOf");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_internal_set_prototype_reported(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            refusal
        );
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[2] = {
        proxy_object(slots[0])->target, slots[1],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[2], 2u, trap_arguments);
    }
    bool accepted = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && accepted) {
        OseoResult extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
        else if (!oseo_to_boolean(extensible.value)) {
            OseoResult actual = oseo_internal_get_prototype(
                context, proxy_object(slots[0])->target);
            if (actual.status != OSEO_STATUS_NORMAL) result = actual;
            else if (!oseo_internal_same_value(actual.value, slots[1])) {
                result = type_error(
                    context,
                    "Proxy setPrototypeOf trap violated an invariant.");
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !accepted) {
        *refusal = "Proxy setPrototypeOf trap returned false.";
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = proxy;
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_is_extensible(
    OseoContext *context,
    OseoValue object_value
) {
    if (!is_proxy(object_value)) {
        return normal(oseo_boolean(ordinary_object(object_value)->extensible));
    }
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[2] = {object_value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "isExtensible");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_internal_is_extensible(
            context, proxy_object(slots[0])->target);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[1] = {proxy_object(slots[0])->target};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[1], 1u, trap_arguments);
    }
    bool answer = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoResult actual = oseo_internal_is_extensible(
            context, proxy_object(slots[0])->target);
        if (actual.status != OSEO_STATUS_NORMAL) result = actual;
        else if (answer != oseo_to_boolean(actual.value)) {
            result = type_error(
                context, "Proxy isExtensible trap violated an invariant.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_boolean(answer));
    }
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_prevent_extensions_reported(
    OseoContext *context,
    OseoValue object_value,
    const char **refusal
) {
    *refusal = NULL;
    if (!is_proxy(object_value)) {
        ordinary_object(object_value)->extensible = false;
        return normal(object_value);
    }
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[2] = {object_value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "preventExtensions");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_internal_prevent_extensions_reported(
            context, proxy_object(slots[0])->target, refusal);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[1] = {proxy_object(slots[0])->target};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[1], 1u, trap_arguments);
    }
    bool accepted = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && accepted) {
        OseoResult extensible = oseo_internal_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
        else if (oseo_to_boolean(extensible.value)) {
            result = type_error(
                context, "Proxy preventExtensions trap violated an invariant.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !accepted) {
        *refusal = "Proxy preventExtensions trap returned false.";
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = object_value;
    return proxy_complete(context, &frame, result);
}

static bool compatible_descriptor(
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    OseoValue getter,
    OseoValue setter,
    bool current_exists,
    OseoValue current_value,
    OseoPropertyAttributes current,
    OseoValue current_getter,
    OseoValue current_setter,
    bool extensible
) {
    if (!current_exists) return extensible;
    if (current.configurable) return true;
    if (descriptor->has_configurable && descriptor->configurable) return false;
    if (descriptor->has_enumerable &&
        descriptor->enumerable != current.enumerable) return false;
    bool descriptor_accessor = descriptor->has_getter || descriptor->has_setter;
    bool descriptor_data = descriptor->has_value || descriptor->has_writable;
    if ((descriptor_accessor && !current.accessor) ||
        (descriptor_data && current.accessor)) return false;
    if (current.accessor) {
        if (descriptor->has_getter &&
            !oseo_internal_same_value(getter, current_getter)) return false;
        if (descriptor->has_setter &&
            !oseo_internal_same_value(setter, current_setter)) return false;
        return true;
    }
    if (!current.writable) {
        if (descriptor->has_writable && descriptor->writable) return false;
        if (descriptor->has_value &&
            !oseo_internal_same_value(value, current_value)) return false;
    }
    return true;
}

OseoResult oseo_internal_proxy_get_own_property(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key,
    bool *found,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
) {
    *found = false;
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[6] = {
        proxy, key, oseo_undefined(), oseo_undefined(), oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(
        context, slots[0], "getOwnPropertyDescriptor");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            found,
            value,
            attributes,
            getter,
            setter
        );
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[2] = {
        proxy_object(slots[0])->target, slots[1],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[2], 2u, trap_arguments);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[2]) != OSEO_TAG_UNDEFINED &&
        !is_object(slots[2])) {
        result = type_error(
            context,
            "Proxy getOwnPropertyDescriptor trap returned an invalid value.");
    }
    bool target_found = false;
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes target_attributes = {false, false, false, false};
    OseoValue target_getter = oseo_undefined();
    OseoValue target_setter = oseo_undefined();
    if (result.status == OSEO_STATUS_NORMAL) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &target_found,
            &target_value,
            &target_attributes,
            &target_getter,
            &target_setter
        );
    }
    OseoResult extensible = normal(oseo_boolean(false));
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[2]) == OSEO_TAG_UNDEFINED) {
        if (!target_found) {
            return proxy_complete(
                context, &frame, normal(oseo_undefined()));
        }
        if (!target_attributes.configurable) {
            result = type_error(
                context,
                "Proxy getOwnPropertyDescriptor trap violated an invariant.");
            return proxy_complete(context, &frame, result);
        }
        extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) {
            return proxy_complete(context, &frame, extensible);
        }
        if (!oseo_to_boolean(extensible.value)) {
            result = type_error(
                context,
                "Proxy getOwnPropertyDescriptor trap violated an invariant.");
        }
        result = result.status == OSEO_STATUS_NORMAL
            ? normal(oseo_undefined())
            : result;
        return proxy_complete(context, &frame, result);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
    }
    OseoConvertedDescriptor descriptor = {0};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_property_descriptor(
            context,
            slots[2],
            &slots[3],
            &slots[4],
            &slots[5],
            &descriptor
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        bool accessor = descriptor.has_getter || descriptor.has_setter;
        bool data = descriptor.has_value || descriptor.has_writable;
        descriptor.has_enumerable = true;
        descriptor.has_configurable = true;
        if (!accessor) {
            descriptor.has_value = true;
            descriptor.has_writable = true;
            if (!data) slots[3] = oseo_undefined();
        } else {
            descriptor.has_getter = true;
            descriptor.has_setter = true;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !compatible_descriptor(
            &descriptor,
            slots[3],
            slots[4],
            slots[5],
            target_found,
            target_value,
            target_attributes,
            target_getter,
            target_setter,
            oseo_to_boolean(extensible.value))) {
        result = type_error(
            context,
            "Proxy getOwnPropertyDescriptor trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        descriptor.has_configurable && !descriptor.configurable &&
        (!target_found || target_attributes.configurable)) {
        result = type_error(
            context,
            "Proxy getOwnPropertyDescriptor trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL && target_found &&
        !descriptor.configurable && !target_attributes.configurable &&
        !target_attributes.accessor && target_attributes.writable &&
        descriptor.has_writable && !descriptor.writable) {
        result = type_error(
            context,
            "Proxy getOwnPropertyDescriptor trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        bool accessor = descriptor.has_getter || descriptor.has_setter;
        *found = true;
        *value = descriptor.has_value ? slots[3] : oseo_undefined();
        *getter = descriptor.has_getter ? slots[4] : oseo_undefined();
        *setter = descriptor.has_setter ? slots[5] : oseo_undefined();
        *attributes = (OseoPropertyAttributes){
            descriptor.has_configurable && descriptor.configurable,
            descriptor.has_enumerable && descriptor.enumerable,
            descriptor.has_writable && descriptor.writable,
            accessor,
        };
    }
    return proxy_complete(context, &frame, result);
}

static OseoResult define_descriptor_field(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes attrs = {true, true, true, false};
        result = oseo_object_define(
            context, slots[0], slots[2], slots[1], attrs);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult descriptor_object(
    OseoContext *context,
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    OseoValue getter,
    OseoValue setter
) {
    OseoValue slots[4] = {value, getter, setter, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_literal_create(context);
    slots[3] = result.value;
#define DEFINE_DESCRIPTOR_FIELD(condition, name, field_value) \
    if (result.status == OSEO_STATUS_NORMAL && (condition)) { \
        result = define_descriptor_field( \
            context, slots[3], (name), (field_value)); \
    }
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_value, "value", slots[0]);
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_writable, "writable",
        oseo_boolean(descriptor->writable));
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_getter, "get", slots[1]);
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_setter, "set", slots[2]);
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_enumerable, "enumerable",
        oseo_boolean(descriptor->enumerable));
    DEFINE_DESCRIPTOR_FIELD(
        descriptor->has_configurable, "configurable",
        oseo_boolean(descriptor->configurable));
#undef DEFINE_DESCRIPTOR_FIELD
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[3];
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_proxy_define_own_property(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key,
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    OseoValue getter,
    OseoValue setter,
    const char **refusal
) {
    *refusal = NULL;
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[7] = {
        proxy, key, value, getter, setter, oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 7u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "defineProperty");
    slots[5] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[5])) {
        result = oseo_internal_define_converted_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            descriptor,
            slots[2],
            slots[3],
            slots[4],
            refusal
        );
        return proxy_complete(context, &frame, result);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = descriptor_object(
            context, descriptor, slots[2], slots[3], slots[4]);
        slots[6] = result.value;
    }
    OseoValue trap_arguments[3] = {
        proxy_object(slots[0])->target, slots[1], slots[6],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[5], 3u, trap_arguments);
    }
    bool accepted = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && !accepted) {
        *refusal = "Proxy defineProperty trap returned false.";
    }
    bool target_found = false;
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes target_attributes = {false, false, false, false};
    OseoValue target_getter = oseo_undefined();
    OseoValue target_setter = oseo_undefined();
    if (result.status == OSEO_STATUS_NORMAL && accepted) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &target_found,
            &target_value,
            &target_attributes,
            &target_getter,
            &target_setter
        );
    }
    OseoResult extensible = normal(oseo_boolean(false));
    if (result.status == OSEO_STATUS_NORMAL && accepted) {
        extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
    }
    if (result.status == OSEO_STATUS_NORMAL && accepted &&
        !compatible_descriptor(
            descriptor,
            slots[2],
            slots[3],
            slots[4],
            target_found,
            target_value,
            target_attributes,
            target_getter,
            target_setter,
            oseo_to_boolean(extensible.value))) {
        result = type_error(
            context, "Proxy defineProperty trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL && accepted &&
        descriptor->has_configurable && !descriptor->configurable &&
        (!target_found || target_attributes.configurable)) {
        result = type_error(
            context, "Proxy defineProperty trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL && accepted && target_found &&
        !target_attributes.configurable && !target_attributes.accessor &&
        target_attributes.writable && descriptor->has_writable &&
        !descriptor->writable) {
        result = type_error(
            context, "Proxy defineProperty trap violated an invariant.");
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = proxy;
    return proxy_complete(context, &frame, result);
}

OseoResult oseo_internal_proxy_delete(
    OseoContext *context,
    OseoValue proxy,
    OseoValue key,
    bool strict
) {
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[3] = {proxy, key, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "deleteProperty");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_object_delete(
            context, proxy_object(slots[0])->target, slots[1], strict);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[2] = {
        proxy_object(slots[0])->target, slots[1],
    };
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[2], 2u, trap_arguments);
    }
    bool accepted = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    bool target_found = false;
    OseoValue target_value = oseo_undefined();
    OseoPropertyAttributes target_attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    if (result.status == OSEO_STATUS_NORMAL && accepted) {
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            slots[1],
            &target_found,
            &target_value,
            &target_attributes,
            &getter,
            &setter
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && accepted && target_found) {
        if (!target_attributes.configurable) {
            result = type_error(
                context, "Proxy deleteProperty trap violated an invariant.");
        } else {
            OseoResult extensible = target_is_extensible(
                context, proxy_object(slots[0])->target);
            if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
            else if (!oseo_to_boolean(extensible.value)) {
                result = type_error(
                    context,
                    "Proxy deleteProperty trap violated an invariant.");
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !accepted && strict) {
        result = type_error(
            context, "Proxy deleteProperty trap returned false.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_boolean(accepted));
    }
    return proxy_complete(context, &frame, result);
}

static bool list_contains(
    const OseoValue *values,
    size_t count,
    OseoValue key
) {
    for (size_t index = 0u; index < count; index += 1u) {
        if (oseo_internal_property_key_equal(values[index], key)) return true;
    }
    return false;
}

/* CreateListFromArrayLike with the ownKeys element-type check at each Get. */
static OseoResult property_key_list(
    OseoContext *context,
    OseoValue source,
    OseoValue *list
) {
    if (!is_object(source)) {
        return type_error(context, "Proxy ownKeys trap must return an object.");
    }
    OseoValue slots[4] = {
        source, oseo_undefined(), oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    double length = 0.0;
    OseoResult result = normal(slots[0]);
    if (is_array(slots[0])) {
        length = (double)ordinary_object(slots[0])->array_length;
    } else {
        result = oseo_internal_ascii_string(context, "length");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[0], slots[2]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_to_number(context, result.value);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            double number = number_value(result.value);
            if (number > 0.0) {
                length = floor(number);
                if (length > 9007199254740991.0) {
                    length = 9007199254740991.0;
                }
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && length > (double)SIZE_MAX) {
        result = failure(
            context, "OSEO2001", "A Proxy ownKeys result is too large.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        slots[1] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && (double)index < length;
         index += 1u) {
        result = oseo_property_key(context, oseo_number((double)index));
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[0], slots[2]);
            slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            !is_string(slots[3]) && !is_symbol(slots[3])) {
            result = type_error(
                context, "Proxy ownKeys trap returned an invalid key.");
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_argument_list_append(
                context, slots[1], slots[3]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) *list = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_proxy_own_keys(
    OseoContext *context,
    OseoValue proxy,
    OseoOwnKeyFilter filter
) {
    OseoResult entry = oseo_call_enter(context);
    if (entry.status != OSEO_STATUS_NORMAL) return entry;
    OseoValue slots[6] = {
        proxy, oseo_undefined(), oseo_undefined(), oseo_undefined(),
        oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], "ownKeys");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_internal_own_key_array(
            context, proxy_object(slots[0])->target, filter);
        return proxy_complete(context, &frame, result);
    }
    OseoValue trap_arguments[1] = {proxy_object(slots[0])->target};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(context, slots[0], slots[1], 1u, trap_arguments);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = property_key_list(context, slots[2], &slots[3]);
    }
    size_t trap_count = 0u;
    const OseoValue *trap_values = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context, slots[3], &trap_count, &trap_values);
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < trap_count;
         index += 1u) {
        if (list_contains(trap_values, index, trap_values[index])) {
            result = type_error(
                context, "Proxy ownKeys trap returned invalid keys.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_own_key_array(
            context, proxy_object(slots[0])->target, OSEO_OWN_KEY_ALL);
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_array_like_list(context, slots[4], &slots[5]);
    }
    size_t target_count = 0u;
    const OseoValue *target_values = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context, slots[5], &target_count, &target_values);
    }
    OseoResult extensible = normal(oseo_boolean(false));
    if (result.status == OSEO_STATUS_NORMAL) {
        extensible = target_is_extensible(
            context, proxy_object(slots[0])->target);
        if (extensible.status != OSEO_STATUS_NORMAL) result = extensible;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < target_count;
         index += 1u) {
        bool found = false;
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        result = target_own_property(
            context,
            proxy_object(slots[0])->target,
            target_values[index],
            &found,
            &value,
            &attributes,
            &getter,
            &setter
        );
        if (result.status == OSEO_STATUS_NORMAL && found &&
            (!attributes.configurable || !oseo_to_boolean(extensible.value)) &&
            !list_contains(trap_values, trap_count, target_values[index])) {
            result = type_error(
                context, "Proxy ownKeys trap omitted a required key.");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !oseo_to_boolean(extensible.value) && trap_count != target_count) {
        result = type_error(context, "Proxy ownKeys trap added an extra key.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        slots[1] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < trap_count;
         index += 1u) {
        OseoValue key = trap_values[index];
        if ((filter == OSEO_OWN_KEY_STRINGS && is_symbol(key)) ||
            (filter == OSEO_OWN_KEY_SYMBOLS && !is_symbol(key))) continue;
        result = oseo_array_append(context, slots[1], key);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    return proxy_complete(context, &frame, result);
}

static OseoResult array_from_arguments(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = oseo_array_create(context, 0u);
    OseoValue array = result.value;
    OseoRootFrame frame = {NULL, &array, 1u};
    oseo_roots_push(context, &frame);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        result = oseo_array_append(context, array, arguments[index]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = array;
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_is_array(
    OseoContext *context,
    OseoValue value
) {
    while (is_proxy(value)) {
        if (proxy_object(value)->revoked) {
            return type_error(context, "Cannot inspect a revoked Proxy.");
        }
        value = proxy_object(value)->target;
    }
    return normal(oseo_boolean(is_array(value)));
}

OseoResult oseo_internal_proxy_call(
    OseoContext *context,
    OseoValue proxy,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    bool constructing = tag_of(new_target) != OSEO_TAG_UNDEFINED;
    if ((!constructing && !proxy_object(proxy)->callable) ||
        (constructing && !proxy_object(proxy)->constructible)) {
        return type_error(context, "A Proxy target is not callable.");
    }
    const char *name = constructing ? "construct" : "apply";
    OseoValue slots[5] = {
        proxy, receiver, new_target, oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_trap(context, slots[0], name);
    slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[3])) {
        OseoValue target = proxy_object(slots[0])->target;
        if (!constructing) {
            result = oseo_call_function(
                context, target, slots[1], argument_count, arguments,
                oseo_undefined());
        } else {
            result = oseo_internal_construct_receiver(
                context, target, slots[2]);
            slots[4] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_call_function(
                    context, target, slots[4], argument_count, arguments,
                    slots[2]);
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_constructor_result(
                    context, result.value, slots[4]);
            }
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_from_arguments(context, argument_count, arguments);
        slots[4] = result.value;
    }
    OseoValue trap_arguments[3] = {
        proxy_object(slots[0])->target,
        constructing ? slots[4] : slots[1],
        constructing ? slots[2] : slots[4],
    };
    size_t trap_count = constructing ? 3u : 3u;
    if (!constructing) {
        trap_arguments[1] = slots[1];
        trap_arguments[2] = slots[4];
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = call_trap(
            context, slots[0], slots[3], trap_count, trap_arguments);
    }
    if (result.status == OSEO_STATUS_NORMAL && constructing &&
        !is_object(result.value)) {
        result = type_error(
            context, "Proxy construct trap must return an object.");
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult create_builtin(
    OseoContext *context,
    const char *name,
    size_t length,
    size_t code_id,
    OseoValue environment
) {
    size_t name_length = strlen(name);
    if (name_length > 16u) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    uint16_t units[16];
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    return oseo_function_create(
        context, code_id, environment, units, name_length, length,
        OSEO_FUNCTION_INTERNAL, oseo_undefined(), oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE);
}

static OseoResult proxy_revocable(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[6] = {
        argument(argument_count, arguments, 0u),
        argument(argument_count, arguments, 1u),
        oseo_undefined(), oseo_undefined(), oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    OseoResult result = proxy_create(context, slots[0], slots[1]);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_create(context, 1u);
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(context, slots[3], 0u, slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_builtin(
            context, "", 0u, OSEO_PROXY_REVOKE_CODE_ID, slots[3]);
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_literal_create(context);
        slots[5] = result.value;
    }
    static const OseoPropertyAttributes attrs = {true, true, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "proxy");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context, slots[5], slots[3], slots[2], attrs);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "revoke");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context, slots[5], slots[3], slots[4], attrs);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[5];
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_proxy_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)receiver;
    if (code_id == OSEO_PROXY_REVOKE_CODE_ID) {
        OseoResult environment = oseo_function_environment(context, callee);
        if (environment.status != OSEO_STATUS_NORMAL) return environment;
        OseoResult stored = oseo_environment_get(
            context, environment.value, 0u);
        if (stored.status != OSEO_STATUS_NORMAL) return stored;
        if (tag_of(stored.value) == OSEO_TAG_NULL) {
            return normal(oseo_undefined());
        }
        OseoValue proxy = stored.value;
        OseoResult cleared = oseo_environment_set(
            context, environment.value, 0u, oseo_null());
        if (cleared.status != OSEO_STATUS_NORMAL) return cleared;
        proxy_object(proxy)->revoked = true;
        return normal(oseo_undefined());
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        if (code_id != OSEO_PROXY_CONSTRUCTOR_CODE_ID) {
            return type_error(context, "Proxy.revocable is not a constructor.");
        }
        return proxy_create(
            context,
            argument(argument_count, arguments, 0u),
            argument(argument_count, arguments, 1u)
        );
    }
    if (code_id == OSEO_PROXY_CONSTRUCTOR_CODE_ID) {
        return type_error(context, "Proxy must be called with new.");
    }
    if (code_id == OSEO_PROXY_REVOCABLE_CODE_ID) {
        return proxy_revocable(context, argument_count, arguments);
    }
    return oseo_unknown_function(context, code_id);
}

OseoResult oseo_internal_proxy_intrinsic(OseoContext *context) {
    OseoValue *slot = &context->intrinsics[OSEO_INTRINSIC_PROXY];
    if (is_function(*slot)) return normal(*slot);
    OseoValue slots[4] = {
        oseo_undefined(), oseo_undefined(), oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_builtin(
            context, "Proxy", 2u, OSEO_PROXY_CONSTRUCTOR_CODE_ID, slots[0]);
        slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) *slot = slots[1];
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_builtin(
            context, "revocable", 2u, OSEO_PROXY_REVOCABLE_CODE_ID, slots[0]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "revocable");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes attrs = {true, false, true, false};
        result = oseo_object_define(
            context, slots[1], slots[3], slots[2], attrs);
    }
    if (result.status != OSEO_STATUS_NORMAL) *slot = oseo_undefined();
    else result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_install_proxy_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_proxy_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Proxy");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes attrs = {true, false, true, false};
        result = oseo_object_define(
            context, slots[0], slots[2], slots[1], attrs);
    }
    oseo_roots_pop(context, &frame);
    return result;
}
