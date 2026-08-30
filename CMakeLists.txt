cmake_minimum_required(VERSION 3.10)
project(scramble VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt5 COMPONENTS Widgets REQUIRED)

add_executable(scramble
    main.cpp
    team.cpp
    scramble.cpp
    scramblewindow.cpp
    team.h
    scramble.h
    scramblewindow.h
)

target_link_libraries(scramble
    PRIVATE
        Qt5::Widgets
)

target_include_directories(scramble PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Ship the dataset next to the executable so it is found at runtime.
add_custom_command(TARGET scramble POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_CURRENT_SOURCE_DIR}/data $<TARGET_FILE_DIR:scramble>/data
    COMMENT "Copying data/ next to executable")

# Bundle the MSVC runtime DLLs (vcruntime140.dll, msvcp140.dll, ...) next to the exe so
# the app launches on machines without the Visual C++ Redistributable installed. We only
# want the DLL list, not CMake's install() rule, hence the _SKIP.
set(CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS_SKIP TRUE)
include(InstallRequiredSystemLibraries)
if(CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS)
    add_custom_command(TARGET scramble POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS} $<TARGET_FILE_DIR:scramble>
        COMMENT "Copying MSVC runtime DLLs next to executable")
endif()

# `cmake --build build --config Release --target package` produces a self-contained
# zip (exe + Qt runtime DLLs/plugins + data/) that a player can unzip and double-click.
# The build dir already holds a complete runnable folder: vcpkg's app-local deps copy
# the Qt DLLs + plugins next to the exe, and the POST_BUILD step above adds data/. We
# just stage that into a named folder and archive it so the zip extracts cleanly.
set(SCRAMBLE_PKG_NAME "scramble-windows-x64")
add_custom_target(package
    COMMAND ${CMAKE_COMMAND} -E rm -rf ${CMAKE_BINARY_DIR}/pkg
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        $<TARGET_FILE_DIR:scramble> ${CMAKE_BINARY_DIR}/pkg/${SCRAMBLE_PKG_NAME}
    COMMAND ${CMAKE_COMMAND} -E chdir ${CMAKE_BINARY_DIR}/pkg
        ${CMAKE_COMMAND} -E tar cf ${CMAKE_BINARY_DIR}/${SCRAMBLE_PKG_NAME}.zip --format=zip
        ${SCRAMBLE_PKG_NAME}
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
    DEPENDS scramble
    COMMENT "Packaging self-contained app -> build/${SCRAMBLE_PKG_NAME}.zip")
