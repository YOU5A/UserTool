import { useState, memo } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";

interface AmountModalProps {
  type: "add" | "subtract";
}

export const AmountModal = memo(function AmountModal({ type }: AmountModalProps) {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const modalKey = type === "add" ? "addAmount" as const : "subtractAmount" as const;
  const isOpen = store.modals[modalKey];
  const title = type === "add" ? "添加金额" : "减少金额";
  const label = type === "add" ? "充值金额" : "消费金额";

  const onClose = () => {
    store.closeModal(modalKey);
    setAmount("");
    setDescription("");
    setError("");
  };

  const handleSubmit = () => {
    setError("");
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError("请输入有效的金额"); return; }
    if (!store.currentUserId) { setError("未选择用户"); return; }

    const success = type === "add"
      ? mgr.addAmount(store.currentUserId, num, description)
      : mgr.subtractAmount(store.currentUserId, num, description);

    if (!success) {
      setError(type === "subtract" ? "余额不足" : "操作失败");
      return;
    }

    rerender();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">{label}</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">备注 (可选)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="备注信息..." />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSubmit}
              className={type === "add" ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"}>
              确认{type === "add" ? "充值" : "消费"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
