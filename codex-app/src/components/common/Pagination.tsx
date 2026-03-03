import './Pagination.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export default function Pagination({ currentPage, totalPages, onPageChange, disabled = false }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Logic to show limited page numbers (e.g. 1 2 3 ... 99 100)
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, currentPage + 2);

      if (currentPage <= 3) {
        endPage = maxVisiblePages;
      } else if (currentPage >= totalPages - 2) {
        startPage = totalPages - maxVisiblePages + 1;
      }

      if (startPage > 1) {
        pages.push(1);
        if (startPage > 2) pages.push('...');
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="pagination-container">
      <button
        className="pagination-btn"
        disabled={currentPage === 1 || disabled}
        onClick={() => onPageChange(1)}
        title="First Page"
      >
        «
      </button>
      <button
        className="pagination-btn"
        disabled={currentPage === 1 || disabled}
        onClick={() => onPageChange(currentPage - 1)}
        title="Previous Page"
      >
        ‹
      </button>

      <div className="pagination-numbers">
        {getPageNumbers().map((page, index) => {
          if (page === '...') {
            return (
              <span key={`dots-${index}`} className="pagination-dots">
                ...
              </span>
            );
          }
          return (
            <button
              key={`page-${page}`}
              className={`pagination-btn pagination-number ${currentPage === page ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </button>
          );
        })}
      </div>

      <button
        className="pagination-btn"
        disabled={currentPage === totalPages || disabled}
        onClick={() => onPageChange(currentPage + 1)}
        title="Next Page"
      >
        ›
      </button>
      <button
        className="pagination-btn"
        disabled={currentPage === totalPages || disabled}
        onClick={() => onPageChange(totalPages)}
        title="Last Page"
      >
        »
      </button>
    </div>
  );
}
