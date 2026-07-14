#ifndef OSEO_PROBE_RUNTIME_H
#define OSEO_PROBE_RUNTIME_H

#include <stdbool.h>
#include <stdint.h>

typedef struct OseoProbeRuntime OseoProbeRuntime;

OseoProbeRuntime *oseo_probe_runtime_create(void);
void oseo_probe_runtime_destroy(OseoProbeRuntime *runtime);
bool oseo_probe_add_i64(
    OseoProbeRuntime *runtime,
    int64_t left,
    int64_t right,
    int64_t *output
);

#endif
