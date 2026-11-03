// Evita la consola en Windows en modo release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    idy_notch_lib::run()
}
