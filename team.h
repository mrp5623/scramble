#pragma once
#include <string>
#include <vector>

class Team {
    std::string name;
    std::vector<std::string> players;
public:
    Team() = default;
    Team(std::string name, std::vector<std::string> players);
    std::string getName() const;
    std::vector<std::string> getPlayerList() const;
};
