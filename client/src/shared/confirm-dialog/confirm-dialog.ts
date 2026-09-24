import { Component, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  readonly activeModal = inject(NgbActiveModal);

  // Set by the caller on the componentInstance returned from NgbModal.open()
  // (the standard ng-bootstrap pattern — these are plain properties, not
  // signal inputs, so they can be assigned imperatively after open()).
  title = '';
  message = '';
  confirmLabel = 'Confirm';
  cancelLabel = 'Cancel';

  confirm(): void {
    this.activeModal.close(true);
  }

  cancel(): void {
    this.activeModal.dismiss(false);
  }
}
