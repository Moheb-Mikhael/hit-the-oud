cmake_minimum_required(VERSION 3.16)
project(hit_the_oud CXX)

if(NOT DEFINED CMAKE_TOOLCHAIN_FILE)
    message(FATAL_ERROR "Configure with Emscripten: emcmake cmake -B build")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXECUTABLE_SUFFIX ".js")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/build)

add_executable(oud_dsp cpp/oud_dsp.cpp)

target_include_directories(oud_dsp PRIVATE cpp)
target_compile_options(oud_dsp PRIVATE -O3 -Wall)

target_link_options(oud_dsp PRIVATE
    --bind
    -O3
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sENVIRONMENT=worklet,node
    -sSINGLE_FILE=1
    -sALLOW_MEMORY_GROWTH=0
    -sINITIAL_MEMORY=16777216
    -sFILESYSTEM=0
    -sINVOKE_RUN=0
)
