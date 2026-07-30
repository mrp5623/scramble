#include "team.h"
#include <utility>

Team::Team(std::string name, std::vector<std::string> players)
    : name(std::move(name)), players(std::move(players)) {}

std::string Team::getName() const { return name; }

std::vector<std::string> Team::getPlayerList() const { return players; }
