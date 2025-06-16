#include <QApplication>
#include "scramblewindow.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    ScrambleWindow window;
    window.show();
    return app.exec();
}