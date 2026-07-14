#include "oseo_probe_runtime.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

int main(void) {
    OseoProbeRuntime *runtime = oseo_probe_runtime_create();
    int64_t result = 0;
    if (runtime == NULL || !oseo_probe_add_i64(runtime, 19, 23, &result)) {
        oseo_probe_runtime_destroy(runtime);
        return 1;
    }
    printf("native-boundary=%" PRId64 "\n", result);
    oseo_probe_runtime_destroy(runtime);
    return result == 42 ? 0 : 1;
}
