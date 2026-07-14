#include "oseo_runtime.h"

#include <stdio.h>

int oseo_runtime_write_line(const char *line) {
    if (line == NULL) {
        return 1;
    }
    return puts(line) < 0 ? 1 : 0;
}
