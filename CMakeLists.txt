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
