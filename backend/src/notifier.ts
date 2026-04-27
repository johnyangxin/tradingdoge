// 通知模块已禁用
export async function notifyNewComment(_comment: any): Promise<void> {
  // 通知功能已禁用
}

export async function notifyAllBSignal(_symbol: string, _signalType: 'B' | 'S', _price: number): Promise<void> {
  // 通知功能已禁用
}

export default { notifyNewComment, notifyAllBSignal };