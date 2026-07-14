#include "oseo_probe_runtime.h"

#include <limits.h>
#include <stdlib.h>

struct OseoProbeRuntime {
    uint64_t calls;
};

OseoProbeRuntime *oseo_probe_runtime_create(void) {
    return calloc(1U, sizeof(OseoProbeRuntime));
}

void oseo_probe_runtime_destroy(OseoProbeRuntime *runtime) {
    free(runtime);
}

bool oseo_probe_add_i64(
    OseoProbeRuntime *runtime,
    int64_t left,
    int64_t right,
    int64_t *output
) {
    if (runtime == NULL || output == NULL) {
        return false;
    }
    runtime->calls += 1U;
    if ((right > 0 && left > INT64_MAX - right) ||
        (right < 0 && left < INT64_MIN - right)) {
        return false;
    }
    *output = left + right;
    return true;
}
