/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
