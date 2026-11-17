/* Web-only stand-ins for the STM32 input/timing includes, not a board emulator. */
#ifndef WOOOLAB_WEB_MAIN_H
#define WOOOLAB_WEB_MAIN_H
#include <stdint.h>
#define KEY1_GPIO_Port 0
#define KEY2_GPIO_Port 0
#define KEY1_Pin 0
#define KEY2_Pin 1
#define GPIO_PIN_RESET 0
static inline int HAL_GPIO_ReadPin(int port, int pin) { (void)port; (void)pin; return 1; }
void HAL_Delay(uint32_t ms);
#endif
