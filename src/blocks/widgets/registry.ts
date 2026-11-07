import type { CanvasWidget } from './canvas'
import type { WidgetName } from './catalog'
import { chatWidget } from './chatWidget'
import { deliveryWidget } from './deliveryWidget'
import { mockupWidget } from './mockupWidget'
import { togglesWidget } from './togglesWidget'

/** Drawing of every widget. Used by the 2D card (`WidgetCanvas`) and the 3D card (`WidgetPlane`). */
export const widgets: Record<WidgetName, CanvasWidget<unknown>> = {
  chat: chatWidget,
  toggles: togglesWidget,
  mockup: mockupWidget,
  delivery: deliveryWidget,
}

export const isWidgetName = (name: string): name is WidgetName => name in widgets
