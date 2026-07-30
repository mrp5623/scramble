#include <QApplication>
#include "scramblewindow.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    ScrambleWindow window;
    if (!window.isValid()) {
        return 1;
    }
    window.show();
    return app.exec();
}
