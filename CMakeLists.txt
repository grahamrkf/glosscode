# GlossCode build.
#
#   cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build build
#   ctest --test-dir build
#
# GLOSSCODE_APP=OFF builds only the portable core and its tests (no webview, GTK or WebView2 needed).
# See docs/building.md.
cmake_minimum_required(VERSION 3.21)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/VERSION" GC_VERSION)
string(STRIP "${GC_VERSION}" GC_VERSION)
if(NOT GC_VERSION MATCHES "^([0-9]+)\\.([0-9]+)\\.([0-9]+)(-[0-9A-Za-z.-]+)?$")
    message(FATAL_ERROR "VERSION \"${GC_VERSION}\" isn't MAJOR.MINOR.PATCH")
endif()
set(GC_VERSION_MAJOR ${CMAKE_MATCH_1})
set(GC_VERSION_MINOR ${CMAKE_MATCH_2})
set(GC_VERSION_PATCH ${CMAKE_MATCH_3})

project(GlossCode VERSION ${GC_VERSION_MAJOR}.${GC_VERSION_MINOR}.${GC_VERSION_PATCH} LANGUAGES C)

option(GLOSSCODE_APP "Build the program (needs webview and a C++ compiler); OFF builds the core and tests only" ON)
option(GLOSSCODE_TESTS "Build the core tests" ON)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

if(CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
    set(GC_WARNINGS -Wall -Wextra -Wpedantic -Wshadow -Wstrict-prototypes -Wno-format-truncation)
    if(CMAKE_C_COMPILER_ID MATCHES "Clang")
        list(REMOVE_ITEM GC_WARNINGS -Wno-format-truncation)
    endif()
endif()

# ---------- Core: portable C, standard library only ----------
add_library(glosscode_core STATIC
    src/core/gc_util.c
    src/core/gc_json.c
    src/core/gc_doc.c
    src/core/gc_data.c
    src/core/gc_translate.c
    src/core/gc_checks.c
    src/core/gc_analyze.c
    src/core/gc_api.c)
target_include_directories(glosscode_core PUBLIC src/core)
target_compile_options(glosscode_core PRIVATE ${GC_WARNINGS})
if(NOT WIN32)
    target_link_libraries(glosscode_core PUBLIC m)
endif()

if(GLOSSCODE_TESTS)
    enable_testing()
    foreach(t test_core test_golden)
        add_executable(${t} tests/${t}.c)
        target_link_libraries(${t} PRIVATE glosscode_core)
        target_compile_options(${t} PRIVATE ${GC_WARNINGS})
        add_test(NAME ${t} COMMAND ${t} "${CMAKE_CURRENT_SOURCE_DIR}")
    endforeach()
endif()

if(NOT GLOSSCODE_APP)
    return()
endif()

# ---------- Program: webview shell ----------
enable_language(CXX)
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(FetchContent)

# Pinned third-party code (licenses in THIRD_PARTY_NOTICES.md).
set(WEBVIEW_BUILD_SHARED_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_TARGETS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_CHECKS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_PACKAGING OFF CACHE BOOL "" FORCE)
set(WEBVIEW_USE_COMPAT_MINGW ON CACHE BOOL "" FORCE)
FetchContent_Declare(webview
    GIT_REPOSITORY https://github.com/webview/webview.git
    GIT_TAG 3ab4b5d722438fc8a13e6ca830c5e2372d19a01d # 0.12.0
    GIT_SHALLOW FALSE)
set(NFD_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(NFD_INSTALL OFF CACHE BOOL "" FORCE)
set(NFD_WAYLAND OFF CACHE BOOL "" FORCE)
set(NFD_X11 OFF CACHE BOOL "" FORCE)
FetchContent_Declare(nfd
    GIT_REPOSITORY https://github.com/btzy/nativefiledialog-extended.git
    GIT_TAG 65b2f070a0fcfee0d453a64e770a217ab0b6ff4f # v1.4.1
    GIT_SHALLOW FALSE
    GIT_SUBMODULES "") # only needed for Wayland parent windows, which are off
FetchContent_MakeAvailable(webview nfd)

# The UI without the sample programs (a separate download), built-in data and bridge script, compiled in.
add_custom_command(
    OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/ui/index.html"
    COMMAND ${CMAKE_COMMAND} "-DIN=${CMAKE_CURRENT_SOURCE_DIR}/src/ui/index.html"
            "-DOUT=${CMAKE_CURRENT_BINARY_DIR}/ui/index.html" -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/strip-samples.cmake"
    DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/ui/index.html" "${CMAKE_CURRENT_SOURCE_DIR}/cmake/strip-samples.cmake"
    COMMENT "Leaving the sample programs out of the UI"
    VERBATIM)
set(GC_EMBED "ui/index.html=${CMAKE_CURRENT_BINARY_DIR}/ui/index.html")
list(APPEND GC_EMBED "app/bridge.js=${CMAKE_CURRENT_SOURCE_DIR}/src/app/bridge.js")
list(APPEND GC_EMBED "data/gcode-words.json=${CMAKE_CURRENT_SOURCE_DIR}/data/gcode-words.json")
list(APPEND GC_EMBED "data/gcode-rules.json=${CMAKE_CURRENT_SOURCE_DIR}/data/gcode-rules.json")
file(GLOB GC_LIBRARY CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/data/library/*.json")
list(SORT GC_LIBRARY)
set(GC_EMBED_DEPENDS "${CMAKE_CURRENT_BINARY_DIR}/ui/index.html" "${CMAKE_CURRENT_SOURCE_DIR}/src/app/bridge.js"
    "${CMAKE_CURRENT_SOURCE_DIR}/data/gcode-words.json" "${CMAKE_CURRENT_SOURCE_DIR}/data/gcode-rules.json" "${CMAKE_CURRENT_SOURCE_DIR}/VERSION")
foreach(f IN LISTS GC_LIBRARY)
    get_filename_component(n "${f}" NAME)
    list(APPEND GC_EMBED "data/library/${n}=${f}")
    list(APPEND GC_EMBED_DEPENDS "${f}")
endforeach()
string(REPLACE ";" "|" GC_EMBED_ARG "${GC_EMBED}")
add_custom_command(
    OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/resources.c"
    COMMAND ${CMAKE_COMMAND} "-DOUT=${CMAKE_CURRENT_BINARY_DIR}/resources.c"
            "-DVERSION_FILE=${CMAKE_CURRENT_SOURCE_DIR}/VERSION" "-DFILES=${GC_EMBED_ARG}"
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed.cmake"
    DEPENDS ${GC_EMBED_DEPENDS} "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed.cmake"
    COMMENT "Embedding the UI and built-in data"
    VERBATIM)

set(GC_APP_SOURCES src/app/main.c "${CMAKE_CURRENT_BINARY_DIR}/resources.c")
if(WIN32)
    set(GC_ICON "${CMAKE_CURRENT_SOURCE_DIR}/assets/logo/glosscode.ico")
    set(GC_MANIFEST "${CMAKE_CURRENT_SOURCE_DIR}/src/app/glosscode.manifest")
    configure_file(src/app/glosscode.rc.in "${CMAKE_CURRENT_BINARY_DIR}/glosscode.rc" @ONLY)
    enable_language(RC)
    list(APPEND GC_APP_SOURCES src/app/entry_win32.c src/platform/platform_win32.c "${CMAKE_CURRENT_BINARY_DIR}/glosscode.rc")
else()
    list(APPEND GC_APP_SOURCES src/app/entry_posix.c src/platform/platform_posix.c)
endif()

add_executable(glosscode WIN32 ${GC_APP_SOURCES})
target_include_directories(glosscode PRIVATE src/platform src/app)
target_compile_options(glosscode PRIVATE ${GC_WARNINGS})
target_link_libraries(glosscode PRIVATE glosscode_core webview::core_static nfd)
if(WIN32)
    set_target_properties(glosscode PROPERTIES OUTPUT_NAME GlossCode)
    target_link_libraries(glosscode PRIVATE shell32 ole32 shlwapi version)
    if(MINGW)
        # One self-contained .exe: the C and C++ runtimes inside, wide entry point.
        target_link_options(glosscode PRIVATE -municode -static -static-libgcc -static-libstdc++)
    endif()
endif()

# Opens the window, loads, analyzes and saves a file through the app's own functions, then closes.
if(GLOSSCODE_TESTS)
    set(GC_SMOKE_WRAPPER "")
    if(NOT WIN32)
        find_program(XVFB_RUN xvfb-run)
        if(XVFB_RUN AND NOT DEFINED ENV{DISPLAY} AND NOT DEFINED ENV{WAYLAND_DISPLAY})
            set(GC_SMOKE_WRAPPER "${XVFB_RUN}")
        endif()
    endif()
    if(WIN32 OR GC_SMOKE_WRAPPER OR DEFINED ENV{DISPLAY} OR DEFINED ENV{WAYLAND_DISPLAY})
        add_test(NAME app_smoke COMMAND ${CMAKE_COMMAND} "-DAPP=$<TARGET_FILE:glosscode>" "-DSRC=${CMAKE_CURRENT_SOURCE_DIR}"
                 "-DWORK=${CMAKE_CURRENT_BINARY_DIR}/smoke" "-DWRAPPER=${GC_SMOKE_WRAPPER}"
                 -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/app_smoke.cmake")
    endif()
endif()

# ---------- Install (Linux packages and the portable archive; see scripts/package-linux.sh) ----------
# Windows packages are made from the one .exe by packaging/windows/glosscode.iss instead.
if(NOT WIN32)
    include(GNUInstallDirs)
    install(TARGETS glosscode RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
    install(FILES packaging/linux/glosscode.desktop DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)
    foreach(size 16 32 48 128 256 512)
        install(FILES assets/logo/glosscode-${size}.png
                DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/${size}x${size}/apps RENAME glosscode.png)
    endforeach()
    install(FILES assets/logo/glosscode.svg DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps)
    install(FILES LICENSE THIRD_PARTY_NOTICES.md CHANGELOG.md README.md DESTINATION ${CMAKE_INSTALL_DATADIR}/doc/glosscode)
endif()
