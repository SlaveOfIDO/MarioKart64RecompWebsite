CC := clang
CFLAGS := -target mips -mips2 -mabi=32 -O2 -G0 -mno-abicalls -mno-odd-spreg -mno-check-zero-division -fomit-frame-pointer -ffast-math -fno-unsafe-math-optimizations -fno-builtin-memset -Wall -Wextra -Wno-incompatible-library-redeclaration -Wno-unused-parameter -Wno-unknown-pragmas -Wno-unused-variable -Wno-missing-braces -Wno-unsupported-floating-point-opt -Werror=section -I.

.PHONY: base clean
.DEFAULT_GOAL := base
base: base.o

base.o: base.c modding.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f base.o
