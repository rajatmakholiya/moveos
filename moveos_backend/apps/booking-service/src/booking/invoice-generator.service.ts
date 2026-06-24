import { Injectable } from '@nestjs/common';

type PdfTextOptions = {
  align?: 'left' | 'center' | 'right';
  continued?: boolean;
  width?: number;
};

type PdfDocument = NodeJS.ReadableStream & {
  fontSize(size: number): PdfDocument;
  font(fontName: string): PdfDocument;
  fillColor(color: string): PdfDocument;
  moveDown(lines?: number): PdfDocument;
  moveTo(x: number, y: number): PdfDocument;
  lineTo(x: number, y: number): PdfDocument;
  strokeColor(color: string): PdfDocument;
  lineWidth(width: number): PdfDocument;
  stroke(): PdfDocument;
  rect(x: number, y: number, width: number, height: number): PdfDocument;
  text(text: string, x?: number, y?: number, options?: PdfTextOptions): PdfDocument;
  text(text: string, options?: PdfTextOptions): PdfDocument;
  end(): void;
  y: number;
};

type PdfDocumentConstructor = new (options?: {
  size?: string;
  margin?: number;
  bufferPages?: boolean;
}) => PdfDocument;

const PDFDocument = require('pdfkit') as PdfDocumentConstructor;

export interface BookingInvoiceInput {
  invoiceNo: string;
  issuedAt: Date;
  passengerName: string;
  passengerPhone: string;
  gstin?: string;
  routeName: string;
  departureAt: Date;
  seatType: 'FRONT' | 'BACK';
  baseFare: number;
  luggageSurcharge: number;
  totalFare: number;
  paymentMethod: 'UPI' | 'CASH';
  paymentStatus: string;
  driverName: string;
  vehicleNumber: string;
  bookingId: string;
}

@Injectable()
export class InvoiceGeneratorService {
  async generateBookingInvoice(booking: BookingInvoiceInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdf = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.renderHeader(doc);
    this.renderInvoiceMeta(doc, booking);
    this.renderPassengerDetails(doc, booking);
    this.renderTripDetails(doc, booking);
    this.renderFareTable(doc, booking);
    this.renderPaymentDetails(doc, booking);
    this.renderQrPlaceholder(doc, booking.bookingId);
    this.renderFooter(doc);

    doc.end();

    return pdf;
  }

  private renderHeader(doc: PdfDocument): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor('#111827')
      .text('PAHADI RIDES', { align: 'center' });

    doc
      .moveDown(0.25)
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#374151')
      .text('Tax Invoice', { align: 'center' });

    doc
      .moveDown(0.75)
      .fontSize(10)
      .text('Pahadi Rides, Pithoragarh, Uttarakhand \u2014 262501', { align: 'center' });

    this.drawDivider(doc, doc.y + 16);
    doc.moveDown(2);
  }

  private renderInvoiceMeta(doc: PdfDocument, booking: BookingInvoiceInput): void {
    const top = doc.y;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Invoice Number', 48, top);
    doc.font('Helvetica').fontSize(11).text(booking.invoiceNo, 170, top);

    doc.font('Helvetica-Bold').text('Issue Date', 340, top);
    doc.font('Helvetica').text(this.formatDate(booking.issuedAt), 430, top);

    doc.moveDown(2);
  }

  private renderPassengerDetails(doc: PdfDocument, booking: BookingInvoiceInput): void {
    this.renderSectionTitle(doc, 'Passenger Details');
    this.renderKeyValue(doc, 'Name', booking.passengerName);
    this.renderKeyValue(doc, 'Phone', booking.passengerPhone);

    if (booking.gstin) {
      this.renderKeyValue(doc, 'GSTIN', booking.gstin);
    }

    doc.moveDown(1);
  }

  private renderTripDetails(doc: PdfDocument, booking: BookingInvoiceInput): void {
    this.renderSectionTitle(doc, 'Trip Details');
    this.renderKeyValue(doc, 'Route', booking.routeName);
    this.renderKeyValue(doc, 'Departure', this.formatDateTime(booking.departureAt));
    this.renderKeyValue(doc, 'Seat Type', booking.seatType);
    this.renderKeyValue(doc, 'Driver', booking.driverName);
    this.renderKeyValue(doc, 'Vehicle', booking.vehicleNumber);
    doc.moveDown(1);
  }

  private renderFareTable(doc: PdfDocument, booking: BookingInvoiceInput): void {
    this.renderSectionTitle(doc, 'Fare Details');

    const startX = 48;
    const startY = doc.y + 4;
    const widths = [210, 150, 110];
    const rowHeight = 28;

    this.renderTableRow(doc, startX, startY, widths, rowHeight, [
      'Base fare',
      'Luggage surcharge',
      'Total',
    ], true);

    this.renderTableRow(doc, startX, startY + rowHeight, widths, rowHeight, [
      this.formatCurrency(booking.baseFare),
      this.formatCurrency(booking.luggageSurcharge),
      this.formatCurrency(booking.totalFare),
    ]);

    doc.y = startY + rowHeight * 2 + 20;
  }

  private renderPaymentDetails(doc: PdfDocument, booking: BookingInvoiceInput): void {
    this.renderSectionTitle(doc, 'Payment Details');
    this.renderKeyValue(doc, 'Payment Method', booking.paymentMethod);
    this.renderKeyValue(doc, 'Payment Status', booking.paymentStatus);
    doc.moveDown(1);
  }

  private renderQrPlaceholder(doc: PdfDocument, bookingId: string): void {
    const x = 48;
    const y = doc.y + 8;
    const size = 112;

    doc.rect(x, y, size, size).strokeColor('#111827').lineWidth(1).stroke();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#111827')
      .text(`Scan to verify booking: ${bookingId}`, x + 10, y + 40, {
        width: size - 20,
        align: 'center',
      });

    doc.y = y + size + 24;
  }

  private renderFooter(doc: PdfDocument): void {
    this.drawDivider(doc, 740);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#374151')
      .text('Thank you for travelling with Pahadi Rides. Safe journey.', 48, 758, {
        align: 'center',
        width: 500,
      });
  }

  private renderSectionTitle(doc: PdfDocument, title: string): void {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(title);
    doc.moveDown(0.4);
  }

  private renderKeyValue(doc: PdfDocument, key: string, value: string): void {
    const y = doc.y;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(`${key}:`, 48, y, {
      width: 120,
    });
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(value, 170, y, {
      width: 360,
    });
    doc.moveDown(0.8);
  }

  private renderTableRow(
    doc: PdfDocument,
    x: number,
    y: number,
    widths: number[],
    height: number,
    cells: string[],
    isHeader = false,
  ): void {
    let cursorX = x;

    cells.forEach((cell, index) => {
      doc.rect(cursorX, y, widths[index], height).strokeColor('#9ca3af').lineWidth(0.75).stroke();
      doc
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor('#111827')
        .text(cell, cursorX + 8, y + 9, {
          width: widths[index] - 16,
          align: index === cells.length - 1 ? 'right' : 'left',
        });
      cursorX += widths[index];
    });
  }

  private drawDivider(doc: PdfDocument, y: number): void {
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#d1d5db').lineWidth(1).stroke();
  }

  private formatCurrency(amountInPaise: number): string {
    const rupees = amountInPaise / 100;

    return `\u20b9${new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(rupees)}`;
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }
}
