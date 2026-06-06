import { useState, memo } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";

export const EditHistoryModal = memo(function EditHistoryModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const userId = store.currentUserId;
  const historyId = store.currentHistoryId;
  const record = userId && historyId ? mgr.getHistory(userId, historyId) : null;

  const [type, setType] = useState<"add" | "subtract">(record?.type || "add");
  const [amount, setAmount] = useState(record ? String(record.amount) : "");
  const [description, setDescription] = useState(record?.description || "");
  const [error, setError] = useState("");

  const onClose = () => { store.closeModal("editHistory"); setError(""); };

  const handleSubmit = () => {
    setError("");
    if (!userId || !historyId) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError("请输入有效的金额"); return; }
    if (!mgr.editHistory(userId, historyId, { type, amount: num, description })) { setError("编辑失败"); return; }
    rerender();
    onClose();
  };

  return (
    <Dialog open={store.modals.editHistory} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">编辑消费记录</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">类型</label>
            <Select value={type} onValueChange={(v) => setType(v as "add" | "subtract")} options={[{ value: "add", label: "充值" }, { value: "subtract", label: "消费" }]} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">金额</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">备注</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSubmit}>确认修改</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export const DeleteHistoryModal = memo(function DeleteHistoryModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const onClose = () => store.closeModal("deleteHistory");
  const handleConfirm = () => {
    if (!store.currentUserId || !store.currentHistoryId) return;
    mgr.deleteHistory(store.currentUserId, store.currentHistoryId);
    rerender();
    onClose();
  };

  return (
    <Dialog open={store.modals.deleteHistory} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">删除消费记录</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">确定要删除这条消费记录吗？余额将相应调整。</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button className="bg-danger hover:bg-danger/90" onClick={handleConfirm}>确认删除</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export const DeleteUserModal = memo(function DeleteUserModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const user = store.currentUserId ? mgr.getUser(store.currentUserId) : null;
  const onClose = () => store.closeModal("deleteUser");
  const handleConfirm = () => {
    if (!store.currentUserId) return;
    mgr.deleteUser(store.currentUserId);
    rerender();
    onClose();
  };

  return (
    <Dialog open={store.modals.deleteUser} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">删除用户</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          确定要删除用户 <strong>{user?.phone || (user ? `尾号 ${user.tail}` : "")}</strong> 吗？删除后可到回收站恢复。
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button className="bg-danger hover:bg-danger/90" onClick={handleConfirm}>确认删除</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
