#include "modding.h"

// RECOMP_IMPORT("*", int recomp_printf(const char* fmt, ...));

// instead of ultratypes.h
typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned char bool;

typedef struct {
    bool used;
    u8* image; // cup icon in rgba16
    void* courses[4];
} CustomCup;

typedef struct {
    u32 num_cups;
    CustomCup cups[];
} ModCourseData;

extern const ModCourseData mod_course_data;

RECOMP_CALLBACK("mk64_custom_cups_parent", on_cups_loading_event)
void custom_cups_on_cups_loading(CustomCup** tail, CustomCup* end) {
    for (u32 i = 0; i < mod_course_data.num_cups; i++) {
        const CustomCup* src = &mod_course_data.cups[i];
        CustomCup* dst = *tail;
        if (dst >= end) {
            // the game has no room left
            // TODO: print error or crash?
            break;
        }

        dst->used = src->used;
        dst->image = src->image;
        for (u32 j = 0; j < 4; j++) {
            dst->courses[j] = src->courses[j];
        }
        *tail = dst + 1;
    }
}
