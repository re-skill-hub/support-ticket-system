import { TestBed } from '@angular/core/testing';
import { ToastService } from '../services/toast.service';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  let toastService: { show: ReturnType<typeof vi.fn> };
  let handler: GlobalErrorHandler;

  beforeEach(() => {
    toastService = { show: vi.fn() };

    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: ToastService, useValue: toastService }],
    });

    handler = TestBed.inject(GlobalErrorHandler);
  });

  it('logs the error and shows a generic toast instead of leaving a blank/broken screen', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handler.handleError(new Error('template blew up'));

    expect(consoleSpy).toHaveBeenCalled();
    expect(toastService.show).toHaveBeenCalledWith('Something went wrong. Please refresh the page.', 'danger');

    consoleSpy.mockRestore();
  });
});
