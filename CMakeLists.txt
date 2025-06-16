cmake_minimum_required(VERSION 3.10)
project(scramble VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(cpr CONFIG REQUIRED)
find_package(LibXml2 REQUIRED)
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
        cpr::cpr
        LibXml2::LibXml2
        Qt5::Widgets
)

target_include_directories(scramble PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

