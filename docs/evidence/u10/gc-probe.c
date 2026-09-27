#include "runtime_internal.h"
#include <stdio.h>
#include <string.h>
#include <time.h>
int main(int argc, char **argv) {
    const clock_t initialize_start = clock();
    OseoContext context;
    oseo_context_init(&context, "u10-probe", 9u);
    context.collect_every_safepoint = true;
    OseoIntrinsic intrinsic = argc > 1 && strcmp(argv[1], "typed") == 0
        ? OSEO_INTRINSIC_TYPED_ARRAY_PROTOTYPE : OSEO_INTRINSIC_SYMBOL;
    OseoResult result = oseo_intrinsic(&context, intrinsic);
    if (result.status != OSEO_STATUS_NORMAL) return 1;
    oseo_collect(&context);
    size_t objects = 0u;
    for (OseoHeapObject *p = context.objects; p != NULL; p = p->next) {
        objects += 1u;
    }
    const double initialize_seconds =
        (double)(clock() - initialize_start) / CLOCKS_PER_SEC;
    const clock_t start = clock();
    for (size_t i = 0u; i < 10000u; i += 1u) oseo_collect(&context);
    const double seconds = (double)(clock() - start) / CLOCKS_PER_SEC;
    printf("objects=%zu collections=10000 cpu_seconds=%.6f "
        "initialize_seconds=%.6f\n",
        objects, seconds, initialize_seconds);
    oseo_context_destroy(&context);
    return 0;
}
